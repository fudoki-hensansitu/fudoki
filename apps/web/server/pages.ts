// pages/ の loader が使う、自治体の頁のデータと頁を描けないときの応答
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { emptyHead, pageHead, type Head } from '../jurisdiction/html'
import { appPageYears, hasTab, tabOfSlug, TAB_LABELS, TAB_SLUGS, type PageTab } from '../jurisdiction/types'
import type { Env } from './env'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../jurisdiction/domains'
import { resolveJurisdiction, type JurisdictionView } from './jurisdiction-routes'

export const notFound = () => new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
export const unavailable = () => new Response('風土記の API に繋がりませんでした。少し待ってからもう一度開いてください。\n', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/** 自治体の頁（/tokyo、/tokyo/nakano、/tokyo/nakano/2024）の props。sitekey は頁の中の「この自治体について質問」の Turnstile。
 * year は年度の段のある頁（/tokyo/nakano/2026、/tokyo/nakano/2024）のときだけ持つ。年度の段の無い /tokyo/nakano は最新の年度を出す入口 */
export type JurisdictionProps = JurisdictionView & { sitekey: string; year?: number; /** 分野の頁（/tokyo/nakano/2026/fields/fukushi）のときの分野の id */ field?: string; /** タブの頁（/tokyo/nakano/2026/projects）のときのタブ */ tab?: Exclude<PageTab, 'overview'> }

/** 年度の段（/tokyo/nakano/2024）。4桁の数字だけ */
export const YEAR_SEGMENT = /^\d{4}$/

/** Cloudflare が公開している「常に通る」試験用の site key。手元は本番の widget の hostname に無いのでこれを使う */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

/**
 * 自治体・都道府県・一覧の頁（HTML と頁を移る時の JSON）をブラウザに置く時間。戻る遷移で取り直さないようにする。
 * ホームと同じ5分にする
 */
export const PAGE_CACHE = 'public, max-age=300'

export async function jurisdictionProps(c: Context, path: string, yearSegment?: string): Promise<JurisdictionProps> {
  const env = c.env as unknown as Env
  let view: JurisdictionView | null
  try {
    view = await resolveJurisdiction(env, path)
  } catch {
    throw new HTTPException(502, { res: unavailable() })
  }
  if (!view) throw new HTTPException(404, { res: notFound() })
  c.header('Cache-Control', PAGE_CACHE)
  if (yearSegment === undefined) return { ...view, sitekey: siteKey(c) }
  // 年度の頁: 頁で選べない年度は 404。頁の中の導線は最新の年度も年度の段つきの URL にする
  const years = view.kind === 'page' ? appPageYears(view.data) : []
  const year = Number(yearSegment)
  if (!YEAR_SEGMENT.test(yearSegment) || !years.includes(year)) throw new HTTPException(404, { res: notFound() })
  return { ...view, sitekey: siteKey(c), year }
}

/** Turnstile の site key（config の var。未設定なら入力を出さない）。手元は本番の widget の hostname に無いので試験用の鍵（.env の試験用 secret と対）にする */
export function siteKey(c: Context): string {
  const { hostname } = new URL(c.req.url)
  return hostname === 'localhost' || hostname === '127.0.0.1' ? TURNSTILE_TEST_SITE_KEY : ((c.env as unknown as Env).TURNSTILE_SITE_KEY ?? '')
}

const FIELD_IDS = new Set([...DOMAIN_FRAMES, OTHER_FRAME].map((f) => f.id))

/** 年度の段の無い分野・タブの頁（/tokyo/nakano/projects）は、最新の年度の段つきの頁へ 301 */
async function toLatestYear(c: Context, path: string, sub: string): Promise<never> {
  const props = await jurisdictionProps(c, path)
  const latest = props.kind === 'page' ? appPageYears(props.data)[0] : undefined
  if (latest === undefined) throw new HTTPException(404, { res: notFound() })
  throw new HTTPException(301, { res: new Response(null, { status: 301, headers: { Location: `${path}/${latest}${sub}` } }) })
}

/** 分野の頁（/tokyo/nakano/2026/fields/fukushi）。分野の id が違えば 404 */
export async function fieldProps(c: Context, path: string, field: string, yearSegment?: string): Promise<JurisdictionProps> {
  if (!FIELD_IDS.has(field)) throw new HTTPException(404, { res: notFound() })
  if (yearSegment === undefined) return toLatestYear(c, path, `/fields/${field}`)
  return { ...(await jurisdictionProps(c, path, yearSegment)), field }
}

/** タブの頁（/tokyo/nakano/projects、/tokyo/nakano/2024/budget）。タブの名前が違う、その年度に決算が無いなら 404 */
export async function tabProps(c: Context, path: string, slug: string, yearSegment?: string): Promise<JurisdictionProps> {
  const tab = tabOfSlug(slug)
  if (!tab) throw new HTTPException(404, { res: notFound() })
  if (yearSegment === undefined) return toLatestYear(c, path, `/${slug}`)
  const props = await jurisdictionProps(c, path, yearSegment)
  if (props.kind === 'page' && !hasTab(props.data, props.year ?? appPageYears(props.data)[0]!, tab)) throw new HTTPException(404, { res: notFound() })
  return { ...props, tab }
}

/** 分野の頁とタブの頁は、題と canonical に分野・タブを足す */
export const jurisdictionHead = (p: JurisdictionProps): Head => {
  if (p.kind !== 'page') return emptyHead(p.entry)
  const field = p.field ? [...DOMAIN_FRAMES, OTHER_FRAME].find((f) => f.id === p.field) : undefined
  const sub = field ? { label: field.name, path: `/fields/${field.id}` } : p.tab ? { label: TAB_LABELS[p.tab], path: `/${TAB_SLUGS[p.tab]}` } : undefined
  return pageHead(p.data, p.year, sub)
}

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
