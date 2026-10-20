// /api/* の入口。どの経路も Turnstile を通した会話の token と、IP ごとの流量で守る（開始だけは Turnstile そのもの）。
// 守りは route() が経路ごとに必ず積む middleware の列で、ハンドラは検査済みの値（c.var）だけを読む。経路を足すときは policy を書かないと型が通らない
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { handleChat } from './chat'
import type { Env, RateLimiter } from './env'
import { clientIp, errorResponse, HttpError, json, rateLimit, readJson } from './http'
import { CHAT_RATE_LIMIT, MAX_CHAT_BODY_BYTES, MAX_RELAY_BODY_BYTES, VIEW_RATE_LIMIT } from './limits'
import { logError } from './log'
import { handleRelay } from './relay'
import { issueSession, verifySession, verifyTurnstile } from './session'

export type AppEnv = { Bindings: Env; Variables: { ip: string; sessionId: string; body: unknown } }
export type AppContext = Context<AppEnv>

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

/** POST だけ。他のサイトの頁から利用者のブラウザ経由で叩かせない（token は sessionStorage にあり cookie ではないが、念のため） */
const guard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'POST だけを受け付けます')
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, 'PERMISSION_DENIED', '別のサイトからは使えません')
  c.set('ip', clientIp(c.req.raw))
  await next()
}

const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('sessionId', await verifySession(c.env.TURNSTILE_SECRET_KEY, c.req.header('Authorization') ?? null))
  await next()
}

const limitRate = (binding: Policy['rate']['binding'], period: number): MiddlewareHandler<AppEnv> => async (c, next) => {
  await rateLimit(c.env[binding] as RateLimiter | undefined, c.var.ip, period)
  await next()
}

const readBody = (maxBytes: number): MiddlewareHandler<AppEnv> => async (c, next) => {
  c.set('body', await readJson(c.req.raw, maxBytes))
  await next()
}

/** 会話の開始だけが通す。Turnstile の token を確かめる */
const requireTurnstile: MiddlewareHandler<AppEnv> = async (c, next) => {
  const body = c.var.body as { turnstileToken?: unknown } | null
  await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, body?.turnstileToken, c.var.ip, new URL(c.req.url).hostname)
  await next()
}

function route(api: Hono<AppEnv>, path: ApiPath, handler: (c: AppContext) => Promise<Response>, ...extra: MiddlewareHandler<AppEnv>[]) {
  const policy: Policy = POLICIES[path]
  api.all(path, guard, ...(policy.session ? [requireSession] : []), limitRate(policy.rate.binding, policy.rate.period), readBody(policy.maxBytes), ...extra, handler)
}

export const api = new Hono<AppEnv>()

route(api, '/api/sessions', async (c) => json(await issueSession(c.env.TURNSTILE_SECRET_KEY!), 201), requireTurnstile)
route(api, '/api/chat', handleChat)
route(api, '/api/mcp', handleRelay)

api.onError((e) => {
  if (e instanceof HttpError) {
    const res = errorResponse(e)
    if (e.status === 405) res.headers.set('Allow', 'POST')
    return res
  }
  logError(e)
  return errorResponse(new HttpError(500, 'INTERNAL', '内部エラー'))
})
