// まだ pages/ に移していない経路（入口の1枚・会話の画面 /s/:id・/api/*・sitemap・PWA・brand のファイル）を worker.ts の Hono に渡す。
// Hono が答えない path（404）は次へ渡し、Void の pages/ と static/ の assets が答える
import { defineMiddleware } from 'void'
import { legacy, PASS } from '../worker'
import type { Env } from '../server/env'

export default defineMiddleware(async (c, next) => {
  const res = await legacy.fetch(c.req.raw, c.env as unknown as Env, c.executionCtx)
  if (res.headers.has(PASS)) return next()
  return res
})
