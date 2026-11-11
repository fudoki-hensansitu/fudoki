// Turnstile の site key。アシスタントの頁と自治体の頁（「この自治体について質問」）の loader が使う
import type { Context } from 'hono'
import type { Env } from './env'

/** Cloudflare が公開している「常に通る」試験用の site key。手元は本番の widget の hostname に無いのでこれを使う */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

/** Turnstile の site key（config の var。未設定なら入力を出さない）。手元は本番の widget の hostname に無いので試験用の鍵（.env の試験用 secret と対）にする */
export function siteKey(c: Context): string {
  const { hostname } = new URL(c.req.url)
  return hostname === 'localhost' || hostname === '127.0.0.1' ? TURNSTILE_TEST_SITE_KEY : ((c.env as unknown as Env).TURNSTILE_SITE_KEY ?? '')
}
