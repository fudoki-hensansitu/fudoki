// 小さなサブサイト（apps/samples/<名前>、別の Worker）を fudoki.dev/<名前> の下で出す。サブサイトは自分の入口（custom domain）を持たず、
// その path の要求をここで Service Binding へそのまま渡し、応答もそのまま返す（CSP・head はサブサイトが付ける。web の頁・ISR・404 の描画は通さない）。
// サブサイトの頁と資産（/<名前>/assets）は、サブサイトの側で同じ path の下に置く
import { defineMiddleware } from 'void'
import type { Env, Fetcher } from '../server/env'

/** path の頭とそれを受ける Worker の binding */
const SAMPLES: Record<string, (env: Env) => Fetcher | undefined> = {
  '/spending': (env) => env.SPENDING,
}

export default defineMiddleware(async (c, next) => {
  const path = c.req.path
  const prefix = Object.keys(SAMPLES).find((p) => path === p || path.startsWith(`${p}/`))
  const target = prefix ? SAMPLES[prefix]!(c.env as unknown as Env) : undefined
  if (!target) return next()
  return target.fetch(c.req.raw)
})
