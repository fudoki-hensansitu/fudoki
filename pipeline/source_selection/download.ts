/** 出典の取得。選定の調査（fetch.ts）と保存（archive.ts）が同じ取り方をする。 */

/** 風土記からの取得と名乗る。User-Agent の無い取得（Bun の既定）を 403 で弾く自治体がある（東村山市 2026-10-23）。 */
export const USER_AGENT = 'Mozilla/5.0 (compatible; fudoki/1.0; +https://fudoki.dev)'
export const MAX_BYTES = 300_000_000
// Orca のブラウザから取り出す1回の大きさ。8MB の base64 で 1 回 0.6 秒前後（48MB の PDF で確かめた）
const BROWSER_CHUNK = 8_000_000

export type Downloaded = { body: Uint8Array; final_url: string; via: 'fetch' | 'browser'; status: number; content_type: string | null }

export class DownloadError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

async function fetchOriginal(url: string): Promise<Downloaded> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) })
  if (!response.ok || !response.body) throw new DownloadError(`Original download failed (HTTP ${response.status})`, response.status)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_BYTES) throw new DownloadError('Original exceeds the cf upload size limit')
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel() }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return { body, final_url: response.url, via: 'fetch', status: response.status, content_type: response.headers.get('content-type') }
}

async function orca(args: string[]): Promise<unknown> {
  const process = Bun.spawn(['orca', ...args, '--json'], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, status] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  const reply = (() => { try { return JSON.parse(stdout) } catch { return undefined } })()
  if (status !== 0 || !reply?.ok) throw new DownloadError(`orca ${args[0]} ${args[1] ?? ''} failed: ${(reply?.error?.message ?? stderr).slice(0, 200)}`)
  return reply.result
}

async function evaluate(page: string, expression: string): Promise<string> {
  const result = await orca(['eval', '--page', page, '--expression', expression]) as { result: string }
  return result.result
}

/**
 * Orca のブラウザで頁を開き、その頁の中で取得してバイト列を取り出す。
 * 同じ origin の頁から fetch するので Cookie・Referer はブラウザのものが付く。`opener` は掲載頁（無ければ出典の origin）。
 */
async function browserOriginal(url: string, opener: string): Promise<Downloaded> {
  const tab = await orca(['tab', 'create', '--url', opener]) as { browserPageId: string }
  const page = tab.browserPageId
  try {
    await Bun.sleep(3000)
    const head = JSON.parse(await evaluate(page, `(async () => {
      const response = await fetch(${JSON.stringify(url)}, { credentials: 'include' })
      window.__fudokiOriginal = new Uint8Array(await response.arrayBuffer())
      return JSON.stringify({ status: response.status, url: response.url, type: response.headers.get('content-type'), bytes: window.__fudokiOriginal.length })
    })()`)) as { status: number; url: string; type: string | null; bytes: number }
    if (head.status < 200 || head.status >= 300) throw new DownloadError(`Browser download failed (HTTP ${head.status})`, head.status)
    if (head.bytes > MAX_BYTES) throw new DownloadError('Original exceeds the cf upload size limit')
    const body = new Uint8Array(head.bytes)
    for (let offset = 0; offset < head.bytes; offset += BROWSER_CHUNK) {
      const encoded = await evaluate(page, `(() => {
        const bytes = window.__fudokiOriginal.subarray(${offset}, ${offset + BROWSER_CHUNK})
        let text = ''
        for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768))
        return btoa(text)
      })()`)
      body.set(Buffer.from(encoded, 'base64'), offset)
    }
    return { body, final_url: head.url, via: 'browser', status: head.status, content_type: head.type }
  } finally {
    await orca(['tab', 'close', '--page', page]).catch(() => undefined)
  }
}

/**
 * 404・410 は無いものとしてそのまま返し、それ以外の失敗（403・429・5xx・接続の失敗など）はブラウザで取り直す。
 * 弾くときに 403 でなく 400・406 などを返すサイトもあるので、状態を絞らない。大きさの上限を超えたときは取り直さない。
 */
function shouldRetryInBrowser(error: unknown): boolean {
  if (!(error instanceof DownloadError)) return true
  return error.status === undefined ? false : error.status !== 404 && error.status !== 410
}

export async function downloadOriginal(url: string, options: { opener?: string; browser?: 'fallback' | 'never' | 'only' } = {}): Promise<Downloaded> {
  const browser = options.browser ?? 'fallback'
  const opener = options.opener ?? `${new URL(url).origin}/`
  if (browser === 'only') return browserOriginal(url, opener)
  try {
    return await fetchOriginal(url)
  } catch (error) {
    if (browser === 'never' || !shouldRetryInBrowser(error)) throw error
    return browserOriginal(url, opener)
  }
}
