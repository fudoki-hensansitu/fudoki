// pages/ の loader が使う、自治体の頁のデータと頁を描けないときの応答
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { emptyHead, pageHead, type Head } from '../jurisdiction/html'
import type { Env } from './env'
import { resolveJurisdiction, type JurisdictionView } from './jurisdiction-routes'

export const notFound = () => new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
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
  if (!view) throw new HTTPException(404, { res: notFound() })
  const { hostname } = new URL(c.req.url)
  const sitekey = hostname === 'localhost' || hostname === '127.0.0.1' ? TURNSTILE_TEST_SITE_KEY : (env.TURNSTILE_SITE_KEY ?? '')
  return { ...view, sitekey }
}

export const jurisdictionHead = (p: JurisdictionProps): Head => (p.kind === 'page' ? pageHead(p.data) : emptyHead(p.entry))
