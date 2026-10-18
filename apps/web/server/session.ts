// 会話の開始で Turnstile を確かめ、その会話だけに使える署名付きの token を渡す。会話の中身は保存しない（ブラウザだけが持つ）。
import { SESSION_TTL_SECONDS } from './limits'
import { HttpError } from './http'

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
/** 入口の島が widget に付ける action。別の頁で取った token を使い回させない */
export const TURNSTILE_ACTION = 'chat-start'

const encoder = new TextEncoder()
const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** session の署名の鍵は Turnstile の secret から用途を分けて作る（secret を1つで済ませる） */
async function signingKey(secret: string) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const derived = await crypto.subtle.sign('HMAC', base, encoder.encode('fudoki-web-chat-session-v1'))
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function issueSession(secret: string, now = Date.now()) {
  const id = crypto.randomUUID()
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS
  const payload = `${id}.${exp}`
  const sig = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload))
  return { id, token: `${payload}.${b64url(sig)}`, expiresAt: exp }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** token が改ざんされておらず、期限内で、指定の会話のものなら会話 ID を返す */
export async function verifySession(secret: string | undefined, header: string | null, now = Date.now()): Promise<string> {
  if (!secret) throw new HttpError(503, 'UNAVAILABLE', 'チャットはまだ準備中です')
  const token = header?.match(/^Bearer (\S+)$/)?.[1]
  const [id, exp, sig, ...rest] = token?.split('.') ?? []
  const fail = () => new HttpError(401, 'UNAUTHENTICATED', '会話の期限が切れました。最初から始めてください')
  if (!id || !exp || !sig || rest.length || !UUID.test(id) || !/^\d+$/.test(exp)) throw fail()
  if (Number(exp) < Math.floor(now / 1000)) throw fail()
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = Uint8Array.from(atob(sig.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
  } catch {
    throw fail()
  }
  const ok = await crypto.subtle.verify('HMAC', await signingKey(secret), bytes, encoder.encode(`${id}.${exp}`)).catch(() => false)
  if (!ok) throw fail()
  return id
}

/** Turnstile の token を siteverify で確かめる。通らなければ 403 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: unknown,
  ip: string,
  hostname: string,
  fetcher: typeof fetch = fetch,
) {
  if (!secret) throw new HttpError(503, 'UNAVAILABLE', 'チャットはまだ準備中です')
  if (typeof token !== 'string' || !token || token.length > 2048) throw new HttpError(400, 'INVALID_ARGUMENT', '確認の token がありません')
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  let result: { success?: boolean; action?: string; hostname?: string }
  try {
    const res = await fetcher(SITEVERIFY_URL, { method: 'POST', body: form })
    if (!res.ok) throw new Error(String(res.status))
    result = await res.json()
  } catch {
    throw new HttpError(502, 'UNAVAILABLE', '確認に失敗しました。もう一度試してください')
  }
  // 別の頁・別のサイトで取った token は通さない。手元（localhost）は Turnstile の試験用の鍵が action・hostname を返さないので success だけを見る
  const local = hostname === 'localhost' || hostname === '127.0.0.1'
  if (result.success !== true || (!local && (result.action !== TURNSTILE_ACTION || result.hostname !== hostname)))
    throw new HttpError(403, 'PERMISSION_DENIED', '確認に失敗しました。もう一度試してください')
}
