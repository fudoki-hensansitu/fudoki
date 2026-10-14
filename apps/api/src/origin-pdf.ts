import type { Db } from './db'
import { ApiError, errorBody, invalid } from './errors'

export const PDF_LIMITS = { bytes: 32 * 1024 * 1024, timeoutMs: 20_000, ttlMs: 24 * 60 * 60 * 1000, requests: 120, fetches: 6, entries: 16 } as const
const CHUNK_BYTES = 64 * 1024
const CHUNK_BATCH = 16

export interface RelayNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

interface Storage {
  get<T>(key: string): Promise<T | undefined>
  get<T>(keys: string[]): Promise<Map<string, T>>
  put(key: string, value: unknown): Promise<void>
  put(entries: Record<string, unknown>): Promise<void>
  delete(keys: string[]): Promise<number>
  transaction<T>(fn: (storage: Storage) => Promise<T>): Promise<T>
  setAlarm(time: number): Promise<void>
  deleteAlarm(): Promise<void>
}
interface State {
  storage: Storage
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>
}
interface CachedPdf { url: string; fetchedAt: number; chunks: number; size: number }
interface Window { start: number; requests: number; fetches: number; urls: string[] }

function publicUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && !u.port && !u.hash &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(u.hostname) && !/^\d+(?:\.\d+){3}$/.test(u.hostname) &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/i.test(u.hostname)
  } catch { return false }
}

/** URLは利用者から受け取らず、原典の宣言からだけ解決する。 */
export async function originPdf(db: Db, relay: RelayNamespace | undefined, request: Request, originId: string): Promise<Response> {
  if (new URL(request.url).search) throw invalid('原典 PDF に query は指定できません')
  const origin = await db.prepare('SELECT url, format FROM origin WHERE origin_id = ?').bind(originId).first<{ url: string; format: string }>()
  if (!origin) throw new ApiError(404, 'NOT_FOUND', '原典が見つかりません')
  if (origin.format !== 'pdf' || !publicUrl(origin.url)) throw invalid('中継対象の公開 PDF ではありません')
  if (!relay) throw new ApiError(503, 'UNAVAILABLE', '原典 PDF の中継を利用できません')
  const response = await relay.get(relay.idFromName('origin-pdf-v1')).fetch(new Request('https://relay.internal/pdf', {
    method: 'POST', body: JSON.stringify({ url: origin.url }),
  }))
  return new Response(response.body, response)
}

const failure = (status: number, message: string) => Response.json(errorBody('PDF_UNAVAILABLE', message), { status })
const chunkKey = (url: string, i: number) => `pdf:${url}:${i}`

/** 表示専用の短期キャッシュ。R2・取り込み時の内容にはアクセスしない。 */
export class OriginPdfRelay {
  constructor(private readonly state: State) {}

  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      const { url } = await request.json() as { url: string }
      if (!publicUrl(url)) return failure(400, '中継対象の公開 PDF ではありません')
      const now = Date.now()
      const cache = await this.expire(now)
      let window = await this.state.storage.get<Window>('window')
      if (!window || now >= window.start + 60_000) window = { start: now, requests: 0, fetches: 0, urls: [] }
      window.requests++
      await this.state.storage.put('window', window)
      if (window.requests > PDF_LIMITS.requests) return failure(429, '閲覧頻度の上限を超えました')
      const hit = cache.find((p) => p.url === url)
      if (hit) return this.response(hit)
      if (window.fetches >= PDF_LIMITS.fetches || window.urls.includes(url)) return failure(429, '取得頻度の上限を超えました')
      if (cache.length >= PDF_LIMITS.entries) return failure(429, 'PDF の保持件数の上限に達しました')
      window.fetches++
      window.urls.push(url)
      await this.state.storage.put('window', window)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PDF_LIMITS.timeoutMs)
      try {
        const upstream = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/pdf' } })
        if (upstream.status !== 200 || !/^application\/pdf(?:\s*;|$)/i.test(upstream.headers.get('content-type') ?? '')) {
          await upstream.body?.cancel()
          // 自治体側の一時的な拒否・リダイレクト・形式の違いを、再発時に見分けられるよう status と形式を出す
          console.error('origin pdf upstream', { url, status: upstream.status, type: upstream.headers.get('content-type') })
          return failure(502, `自治体から PDF を取得できません（HTTP ${upstream.status}${upstream.status === 200 ? `、${upstream.headers.get('content-type') ?? '形式不明'}` : ''}）`)
        }
        if (Number(upstream.headers.get('content-length')) > PDF_LIMITS.bytes) {
          await upstream.body?.cancel()
          return failure(502, 'PDF が32 MiBの上限を超えています')
        }
        if (!upstream.body) return failure(502, 'PDF の本文がありません')
        const parts: Uint8Array[] = []
        let size = 0
        for await (const value of upstream.body as unknown as AsyncIterable<Uint8Array>) {
          size += value.byteLength
          if (size > PDF_LIMITS.bytes) return failure(502, 'PDF が32 MiBの上限を超えています')
          parts.push(value)
        }
        const bytes = new Uint8Array(size)
        let at = 0
        for (const p of parts) { bytes.set(p, at); at += p.byteLength }
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') return failure(502, '取得した内容が PDF ではありません')
        const pdf: CachedPdf = { url, size, fetchedAt: Date.now(), chunks: Math.ceil(size / CHUNK_BYTES) }
        await this.state.storage.transaction(async (storage) => {
          for (let i = 0; i < pdf.chunks; i += CHUNK_BATCH) {
            const entries = Object.fromEntries(Array.from({ length: Math.min(CHUNK_BATCH, pdf.chunks - i) }, (_, j) =>
              [chunkKey(url, i + j), bytes.slice((i + j) * CHUNK_BYTES, (i + j + 1) * CHUNK_BYTES)]))
            await storage.put(entries)
          }
          await storage.put('cache', [...cache, pdf])
          await storage.setAlarm(Math.min(...cache.map((p) => p.fetchedAt), pdf.fetchedAt) + PDF_LIMITS.ttlMs)
        })
        return this.pdfResponse(pdf, bytes)
      } catch (error) {
        if (!controller.signal.aborted) console.error('origin pdf fetch', { url, error: String(error) })
        return failure(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'PDF の取得が20秒の上限を超えました' : '自治体から PDF を取得できません')
      } finally { clearTimeout(timer) }
    })
  }

  private pdfResponse(pdf: CachedPdf, bytes: Uint8Array) {
    return new Response(bytes.buffer as ArrayBuffer, { headers: {
      'Content-Type': 'application/pdf', 'Content-Length': String(pdf.size),
      'X-Origin-Url': encodeURIComponent(pdf.url), 'X-Origin-Fetched-At': new Date(pdf.fetchedAt).toISOString(),
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  }

  private async response(pdf: CachedPdf) {
    const bytes = new Uint8Array(pdf.size)
    for (let i = 0; i < pdf.chunks; i += CHUNK_BATCH) {
      const keys = Array.from({ length: Math.min(CHUNK_BATCH, pdf.chunks - i) }, (_, j) => chunkKey(pdf.url, i + j))
      const parts = await this.state.storage.get<Uint8Array>(keys)
      for (const [j, key] of keys.entries()) {
        const part = parts.get(key)
        if (!part) return failure(502, '保持した PDF を読めません')
        bytes.set(part, (i + j) * CHUNK_BYTES)
      }
    }
    return this.pdfResponse(pdf, bytes)
  }

  private async expire(now: number): Promise<CachedPdf[]> {
    const cache = await this.state.storage.get<CachedPdf[]>('cache') ?? []
    const live = cache.filter((p) => p.fetchedAt + PDF_LIMITS.ttlMs > now)
    if (live.length !== cache.length) await this.state.storage.transaction(async (storage) => {
      for (const p of cache.filter((p) => !live.includes(p))) {
        for (let i = 0; i < p.chunks; i += 128) await storage.delete(Array.from({ length: Math.min(128, p.chunks - i) }, (_, j) => chunkKey(p.url, i + j)))
      }
      await storage.put('cache', live)
      if (live.length) await storage.setAlarm(Math.min(...live.map((p) => p.fetchedAt)) + PDF_LIMITS.ttlMs)
      else await storage.deleteAlarm()
    })
    return live
  }

  async alarm() { await this.state.blockConcurrencyWhile(() => this.expire(Date.now())) }
}
