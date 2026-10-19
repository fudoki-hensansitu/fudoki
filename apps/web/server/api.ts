// /api/* の入口。どの経路も Turnstile を通した会話の token と、IP ごとの流量で守る（開始だけは Turnstile そのもの）。
import type { Ctx, Env } from './env'
import { handleChat } from './chat'
import { clientIp, errorResponse, HttpError, json, rateLimit, readJson } from './http'
import { CHAT_RATE_LIMIT } from './limits'
import { logError } from './log'
import { handleRelay } from './relay'
import { issueSession, verifyTurnstile } from './session'

async function startSession(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request)
  await rateLimit(env.CHAT_RATE_LIMIT, ip, CHAT_RATE_LIMIT.period)
  const body = (await readJson(request, 4096)) as { turnstileToken?: unknown } | null
  await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body?.turnstileToken, ip, new URL(request.url).hostname)
  return json(await issueSession(env.TURNSTILE_SECRET_KEY!), 201)
}

const ROUTES: Record<string, (request: Request, env: Env, ctx: Ctx) => Promise<Response>> = {
  '/api/sessions': startSession,
  '/api/chat': handleChat,
  '/api/mcp': handleRelay,
}

export function isApiPath(pathname: string) {
  return pathname in ROUTES
}

export async function handleApi(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const route = ROUTES[new URL(request.url).pathname]!
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'POST だけを受け付けます')
    // 他のサイトの頁から利用者のブラウザ経由で叩かせない（token は sessionStorage にあり cookie ではないが、念のため）
    const origin = request.headers.get('Origin')
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'PERMISSION_DENIED', '別のサイトからは使えません')
    return await route(request, env, ctx)
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
