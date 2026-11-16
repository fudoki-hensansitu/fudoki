// 公開の REST（/v1/*）の API キーを、WorkOS の検証 API で確かめる（docs/prd/public-api-auth/dd.md の「REST（API キー）」）。
// キーの値はキャッシュの鍵にもログにも残さず、SHA-256 だけを使う。
import type { Env } from '../db'

/** 風土記の REST が受けるキーの permission。補助金など他のサービスのキーは別の permission を持つ */
export const API_KEY_PERMISSION = 'fudoki:read'

/** WorkOS のキーの接頭辞。合わない値は WorkOS を呼ばずに断る */
const KEY_PREFIX = 'sk_'

/** 実際のキーより十分長い上限。超える値は WorkOS を呼ばずに断る（実際のキーの長さを見て詰める） */
export const MAX_KEY_LENGTH = 256

const WORKOS_VALIDATE_URL = 'https://api.workos.com/api_keys/validations'

/** 検証の結果を置く秒数。失効や permission の変更が効くまで最長この秒数かかる */
const VERDICT_TTL_SECONDS = 300

/** WorkOS が答えないときに待つ上限 */
const WORKOS_TIMEOUT_MS = 5_000

export type Verdict = { kind: 'ok'; userId: string } | { kind: 'invalid' } | { kind: 'denied'; reason: string }

/** Workers の Cache API のうち使う部分。bun の試験は Map で満たす */
export interface VerdictCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

export interface AuthDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>
  cache: () => VerdictCache
}

/** WorkOS が落ちている・答えない。401 にすると client が資格情報を作り直しにいくので 503 にし、結果を置かない */
export class AuthUnavailable extends Error {}

/** 本番の依存。caches は Workers にしか無いので、使うときに読む */
export const workerAuthDeps = (): AuthDeps => ({
  fetch: (input, init) => fetch(input, init),
  cache: () => (globalThis as unknown as { caches: { default: VerdictCache } }).caches.default,
})

/** `Authorization: Bearer <値>` の値。形が違えば null */
export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer +(\S+)$/i.exec(header ?? '')
  return m ? m[1]! : null
}

/** WorkOS を呼ぶまでもなく違うとわかる値 */
export const malformedKey = (key: string) => !key.startsWith(KEY_PREFIX) || key.length > MAX_KEY_LENGTH

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cache API の鍵にする URL。Worker の外からは引けない名前にする */
const cacheUrl = (kind: string, id: string) => `https://auth-cache.api.fudoki.dev/${kind}/${id}`

export async function cachedVerdict(deps: AuthDeps, key: string): Promise<Verdict | null> {
  const hit = await deps.cache().match(new Request(cacheUrl('api-key', await sha256Hex(key))))
  return hit ? ((await hit.json()) as Verdict) : null
}

async function storeVerdict(deps: AuthDeps, key: string, verdict: Verdict): Promise<void> {
  const res = new Response(JSON.stringify(verdict), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${VERDICT_TTL_SECONDS}` } })
  await deps.cache().put(new Request(cacheUrl('api-key', await sha256Hex(key))), res)
}

interface ValidationBody {
  api_key: { owner: { type: string; id: string; organization_id?: string }; permissions: string[] } | null
}

/** WorkOS の答えを、風土記がこのキーを通すかに直す */
export function judge(body: ValidationBody, developersOrgId: string): Verdict {
  const k = body.api_key
  if (!k) return { kind: 'invalid' }
  if (k.owner.type !== 'user') return { kind: 'denied', reason: '利用者が発行したキーではありません' }
  if (k.owner.organization_id !== developersOrgId) return { kind: 'denied', reason: '風土記のアカウントの頁で発行したキーではありません' }
  if (!k.permissions.includes(API_KEY_PERMISSION)) return { kind: 'denied', reason: `キーに ${API_KEY_PERMISSION} の権限がありません` }
  return { kind: 'ok', userId: k.owner.id }
}

/** WorkOS に問い合わせ、結果を置く。キャッシュは先に cachedVerdict で引いておく */
export async function verifyRemote(deps: AuthDeps, env: Pick<Env, 'WORKOS_API_KEY' | 'WORKOS_DEVELOPERS_ORG_ID'>, key: string): Promise<Verdict> {
  let res: Response
  try {
    res = await deps.fetch(WORKOS_VALIDATE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WORKOS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: key }),
      signal: AbortSignal.timeout(WORKOS_TIMEOUT_MS),
    })
  } catch (e) {
    console.error('WorkOS の API キー検証に失敗', e instanceof Error ? e.name : 'unknown')
    throw new AuthUnavailable()
  }
  let verdict: Verdict
  if (res.ok) {
    try {
      verdict = judge((await res.json()) as ValidationBody, env.WORKOS_DEVELOPERS_ORG_ID)
    } catch (e) {
      // 本文の途中で timeout した・JSON でない・想定外の形。利用者のキーのせいではないので置かない
      console.error('WorkOS の API キー検証の応答を読めない', e instanceof Error ? e.name : 'unknown')
      throw new AuthUnavailable()
    }
  } else if (res.status === 400 || res.status === 404 || res.status === 422) verdict = { kind: 'invalid' }
  else {
    // 風土記の WORKOS_API_KEY が無効（401・403）・WorkOS の流量の上限（429）・障害（5xx）。どれも利用者のキーのせいではない
    console.error('WorkOS の API キー検証が', res.status, 'を返した')
    throw new AuthUnavailable()
  }
  await storeVerdict(deps, key, verdict)
  return verdict
}

/** 検証に失敗し続けた IP を、上限の窓のあいだ WorkOS を呼ばずに断るための印 */
const BLOCK_SECONDS = 60

export async function ipBlocked(deps: AuthDeps, ip: string): Promise<boolean> {
  return !!(await deps.cache().match(new Request(cacheUrl('blocked-ip', await sha256Hex(ip)))))
}

export async function blockIp(deps: AuthDeps, ip: string): Promise<void> {
  await deps.cache().put(new Request(cacheUrl('blocked-ip', await sha256Hex(ip))), new Response('1', { headers: { 'Cache-Control': `max-age=${BLOCK_SECONDS}` } }))
}
