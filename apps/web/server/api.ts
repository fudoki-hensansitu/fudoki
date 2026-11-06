// /api/sessions・/api/chat・/api/mcp の入口（routes/api/*.ts が呼ぶ）。どの経路も Turnstile を通した会話の token と、IP ごとの流量で守る（開始だけは Turnstile そのもの）。
// 守りは handleApi が経路ごとの policy に従って必ず順に通し、ハンドラは検査済みの値（ApiRequest）だけを読む。経路を足すときは policy を書かないと型が通らない
import type { Context } from 'hono'
import { handleChat } from './chat'
import type { Env, RateLimiter } from './env'
import { clientIp, errorResponse, HttpError, json, rateLimit, readJson, waitUntil } from './http'
import { CHAT_RATE_LIMIT, MAX_CHAT_BODY_BYTES, MAX_RELAY_BODY_BYTES, VIEW_RATE_LIMIT } from './limits'
import { logError } from './log'
import { handleRelay } from './relay'
import { issueSession, verifySession, verifyTurnstile } from './session'

/** 守りを通したあとの要求。sessionId は会話の token を要る経路だけ入る。defer は応答を返したあとも続ける仕事 */
export type ApiRequest = { env: Env; request: Request; ip: string; sessionId: string; body: unknown; defer: (p: Promise<unknown>) => void }

/** 経路ごとの守り。session は会話の token を要るか、rate は流量の binding と上限、maxBytes は body の上限 */
interface Policy {
  session: boolean
  rate: { binding: 'CHAT_RATE_LIMIT' | 'VIEW_RATE_LIMIT'; period: number }
  maxBytes: number
}

const POLICIES = {
  '/api/sessions': { session: false, rate: { binding: 'CHAT_RATE_LIMIT', period: CHAT_RATE_LIMIT.period }, maxBytes: 4096 },
  '/api/chat': { session: true, rate: { binding: 'CHAT_RATE_LIMIT', period: CHAT_RATE_LIMIT.period }, maxBytes: MAX_CHAT_BODY_BYTES },
  '/api/mcp': { session: true, rate: { binding: 'VIEW_RATE_LIMIT', period: VIEW_RATE_LIMIT.period }, maxBytes: MAX_RELAY_BODY_BYTES },
} as const satisfies Record<string, Policy>

export type ApiPath = keyof typeof POLICIES

const HANDLERS: Record<ApiPath, (r: ApiRequest) => Promise<Response>> = {
  // 会話の開始だけは token の代わりに Turnstile を確かめる
  '/api/sessions': async (r) => {
    const body = r.body as { turnstileToken?: unknown } | null
    await verifyTurnstile(r.env.TURNSTILE_SECRET_KEY, body?.turnstileToken, r.ip, new URL(r.request.url).hostname)
    return json(await issueSession(r.env.TURNSTILE_SECRET_KEY!), 201)
  },
  '/api/chat': handleChat,
  '/api/mcp': handleRelay,
}

/** 経路の守りを順に通してハンドラを呼ぶ。守りで落ちたら HttpError の応答、それ以外の失敗は中身を出さず 500 */
export async function handleApi(path: ApiPath, c: Context): Promise<Response> {
  const request = c.req.raw
  const env = c.env as Env
  try {
    // POST だけ。他のサイトの頁から利用者のブラウザ経由で叩かせない（token は sessionStorage にあり cookie ではないが、念のため）
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'POST だけを受け付けます')
    const origin = request.headers.get('Origin')
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'PERMISSION_DENIED', '別のサイトからは使えません')
    const policy: Policy = POLICIES[path]
    const ip = clientIp(request)
    const sessionId = policy.session ? await verifySession(env.TURNSTILE_SECRET_KEY, request.headers.get('Authorization')) : ''
    await rateLimit(env[policy.rate.binding] as RateLimiter | undefined, ip, policy.rate.period)
    const body = await readJson(request, policy.maxBytes)
    return await HANDLERS[path]({ env, request, ip, sessionId, body, defer: (p) => waitUntil(c, p) })
  } catch (e) {
    if (e instanceof HttpError) {
      const res = errorResponse(e)
      if (e.status === 405) res.headers.set('Allow', 'POST')
      return res
    }
    logError(e)
    return errorResponse(new HttpError(500, 'INTERNAL', '内部エラー'))
  }
}
