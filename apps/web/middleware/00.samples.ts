// 小さなサンプル（apps/samples、Worker fudoki-samples）を fudoki.dev/<名前> の下で出す。サンプルは自分の入口（custom domain）を持たず、
// その path の要求をここで Service Binding へそのまま渡し、応答もそのまま返す（CSP・head はサンプルが付ける。web の頁・ISR・404 の描画は通さない）。
// サンプルの頁は pages/<名前>/、build の資産は /samples/assets に置く。サンプルを足したら PREFIXES にその path を足す
import { defineMiddleware } from 'void'
import type { Env } from '../server/env'

/** サンプルの Worker に渡す path の頭。/samples は資産（/samples/assets）の置き場 */
const PREFIXES = ['/spending', '/samples']

export default defineMiddleware(async (c, next) => {
  const path = c.req.path
  if (!PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next()
  const samples = (c.env as unknown as Env).SAMPLES
  if (!samples) return next()
  return samples.fetch(c.req.raw)
})
