// pages/ の loader が使う、自治体の頁のデータと頁を描けないときの応答
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { emptyHead, pageHead, type Head } from '../jurisdiction/html'
import type { Env } from './env'
import { legacyPath, resolveJurisdiction, type JurisdictionView } from './jurisdiction-routes'

export const notFound = () => new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
/** 旧 URL から今の URL へ。検索エンジンに移ったことを伝える */
const movedPermanently = (path: string) => new Response(null, { status: 301, headers: { Location: path, 'Cache-Control': 'public, max-age=86400' } })
export const unavailable = () => new Response('風土記の API に繋がりませんでした。少し待ってからもう一度開いてください。\n', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/** 自治体の頁（/tokyo、/tokyo/nakano）の props。sitekey は頁の中の「この自治体について聞く」の Turnstile */
export type JurisdictionProps = JurisdictionView & { sitekey: string }

/** Cloudflare が公開している「常に通る」試験用の site key。手元は本番の widget の hostname に無いのでこれを使う */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

export async function jurisdictionProps(c: Context, path: string): Promise<JurisdictionProps> {
  const env = c.env as unknown as Env
  let view: JurisdictionView | null
  try {
    view = await resolveJurisdiction(env, path)
  } catch {
    throw new HTTPException(502, { res: unavailable() })
  }
  if (!view) {
    const moved = await legacyPath(env, path).catch(() => null)
    throw new HTTPException(moved ? 301 : 404, { res: moved ? movedPermanently(moved) : notFound() })
  }
  return { ...view, sitekey: siteKey(c) }
}

/** Turnstile の site key（config の var。未設定なら入力を出さない）。手元は本番の widget の hostname に無いので試験用の鍵（.env の試験用 secret と対）にする */
export function siteKey(c: Context): string {
  const { hostname } = new URL(c.req.url)
  return hostname === 'localhost' || hostname === '127.0.0.1' ? TURNSTILE_TEST_SITE_KEY : ((c.env as unknown as Env).TURNSTILE_SITE_KEY ?? '')
}

export const jurisdictionHead = (p: JurisdictionProps): Head => (p.kind === 'page' ? pageHead(p.data) : emptyHead(p.entry))

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 会話の画面（/s/:id）の props。会話の履歴と token はブラウザの sessionStorage にだけあり、サーバーは枠だけを返す（保存させない） */
export type SessionProps = { kind: 'session'; id: string }

export function sessionProps(c: Context, id: string): SessionProps {
  if (!SESSION_ID.test(id)) throw new HTTPException(404, { res: notFound() })
  c.header('Cache-Control', 'no-store')
  return { kind: 'session', id }
}

export const SESSION_HEAD = {
  title: '風土記に聞く',
  meta: [
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ],
}
