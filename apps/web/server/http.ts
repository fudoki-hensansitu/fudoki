import type { RateLimiter } from './env'

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) {
    super(message)
  }
}

export function errorResponse(e: HttpError): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  if (e.retryAfter !== undefined) headers['Retry-After'] = String(e.retryAfter)
  return new Response(JSON.stringify({ error: { code: e.code, message: e.message } }), { status: e.status, headers })
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

/** 利用者の IP。流量の鍵と Turnstile の検証にだけ使い、保存しない */
export const clientIp = (request: Request) => request.headers.get('CF-Connecting-IP') ?? ''

/** body を実際に読んだバイト数で数える（Content-Length は信用しない）。上限を超えたら読むのをやめる */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!/^application\/json\s*(;.*)?$/i.test(request.headers.get('content-type') ?? ''))
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type は application/json にしてください')
  const tooLarge = () => new HttpError(413, 'PAYLOAD_TOO_LARGE', `body は ${maxBytes} バイトまでです`)
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge()
  const chunks: Uint8Array[] = []
  let total = 0
  if (request.body) {
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength
      if (total > maxBytes) throw tooLarge()
      chunks.push(chunk)
    }
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (key, value) => {
      if (key === '__proto__') throw new Error('__proto__')
      return value
    })
  } catch {
    throw new HttpError(400, 'INVALID_ARGUMENT', 'body が JSON ではありません')
  }
}

/** binding が無いときは止める（設定漏れで上限なしに開かない） */
export async function rateLimit(limiter: RateLimiter | undefined, key: string, period: number) {
  if (!limiter) throw new HttpError(503, 'UNAVAILABLE', '流量の制限を利用できないため止めています')
  if (!(await limiter.limit({ key: key || 'unknown' })).success)
    throw new HttpError(429, 'RESOURCE_EXHAUSTED', 'しばらく待ってから送ってください', period)
}
