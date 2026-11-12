// 自治体の頁（/tokyo、/tokyo/nakano と、その下の年度・タブ・分野の頁）の loader が使う props と head。pages/[prefecture]/ の下の .server.ts だけが読む。
// Void は pages/ の下の `_` で始まるファイルを頁にしない。データの取得と cache は server/jurisdiction-routes.ts（OG 画像・sitemap と共有）
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { emptyHead, pageHead, type Head } from '../../jurisdiction/html'
import { appPageYears, hasTab, tabOfSlug, type PageData, type PageTab } from '../../jurisdiction/types'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../../jurisdiction/domains'
import { PREFECTURE_MAPS } from '../../jurisdiction/map.generated'
import { jurisdictionPath, PREFECTURE_SLUGS } from '../../jurisdiction/path'
import { assetPath, EMBLEMS, emblemOf, prefectureCodeOf } from '../../jurisdiction/emblems'
import { VISIONS } from '../../jurisdiction/visions'
import type { Env } from '../../server/env'
import type { CatalogEntry } from '../../server/jurisdiction'
import { catalog, pageData } from '../../server/jurisdiction-routes'
import { loadYearSnapshot } from '../../server/app-data'
import type { Snapshot } from '../../jurisdiction/app/data'
import { siteKey } from '../../server/site-key'

export const notFound = () => new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
export const unavailable = () => new Response('風土記の API に繋がりませんでした。少し待ってからもう一度開いてください。\n', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

/** 自治体の頁（/tokyo、/tokyo/nakano、/tokyo/nakano/2024）の props。sitekey は頁の中の「この自治体について質問」の Turnstile。
 * year は年度の段のある頁（/tokyo/nakano/2026、/tokyo/nakano/2024）のときだけ持つ。年度の段の無い /tokyo/nakano は最新の年度を出す入口 */
export type JurisdictionProps = JurisdictionView & {
  sitekey: string
  year?: number
  /** 分野の頁（/tokyo/nakano/2026/fields/fukushi）のときの分野の id */
  field?: string
  /** タブの頁（/tokyo/nakano/2026/projects）のときのタブ */
  tab?: Exclude<PageTab, 'overview'>
  /** 開いた年度の款項目・施策・評価シート・事業の一覧の1頁目。サーバーで本文まで描くために渡す。API に繋がらなければ無く、画面が取る */
  snapshot?: Snapshot
}

/** 年度の段（/tokyo/nakano/2024）。4桁の数字だけ */
export const YEAR_SEGMENT = /^\d{4}$/

/**
 * 自治体・都道府県・一覧の頁（HTML と頁を移る時の JSON）をブラウザに置く時間。戻る遷移で取り直さないようにする。
 * ホームと同じ5分にする
 */
export const PAGE_CACHE = 'public, max-age=300'

// 自治体の頁は Void の ISR（CDN の cache）に1時間置く（void.config.ts の routing.revalidate に都道府県ごとの path で書く）。過ぎたら古い頁を返しながら裏で描き直す。
// 頁の .server.ts に revalidate を書かないのは、`/:prefecture/:name` のような頁の pattern が静的資産（/assets/*.js など）にも当たり、資産まで ISR に載るため

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

/**
 * 自治体の頁の path（/ で分けた段）から props を作る。pages/[prefecture]/ の下の loader はどれもここを呼ぶ。
 * 都道府県自体の頁（/tokyo/2024/projects）は市区町村の段が無いので、ルーターが当てる経路が市区町村の頁と1段ずれる。段の中身で読み分ける
 */
export async function routeProps(c: Context, segments: string[]): Promise<JurisdictionProps> {
  const [prefecture = '', ...rest] = segments
  const head = rest[0]
  const named = head !== undefined && !YEAR_SEGMENT.test(head) && head !== 'fields' && !tabOfSlug(head)
  const path = named ? `/${prefecture}/${head}` : `/${prefecture}`
  const [a, b, f, ...extra] = named ? rest.slice(1) : rest
  const props = await (async () => {
    if (extra.length) throw new HTTPException(404, { res: notFound() })
    if (a === undefined) return jurisdictionProps(c, path)
    if (a === 'fields') return b !== undefined && f === undefined ? fieldProps(c, path, b) : Promise.reject(new HTTPException(404, { res: notFound() }))
    if (!YEAR_SEGMENT.test(a)) return b === undefined ? tabProps(c, path, a) : Promise.reject(new HTTPException(404, { res: notFound() }))
    if (b === undefined) return jurisdictionProps(c, path, a)
    if (b === 'fields') return f !== undefined ? fieldProps(c, path, f, a) : Promise.reject(new HTTPException(404, { res: notFound() }))
    return f === undefined ? tabProps(c, path, b, a) : Promise.reject(new HTTPException(404, { res: notFound() }))
  })()
  return withSnapshot(c, props)
}

/** 本文のデータを待つ上限。過ぎたら本文の無い頁を返す */
const SNAPSHOT_WAIT_MS = 3000

/** 開いた年度の款項目・施策・評価シート・事業の一覧の1頁目を props に足す（年度の段が無ければ最新の年度） */
async function withSnapshot(c: Context, props: JurisdictionProps): Promise<JurisdictionProps> {
  if (props.kind !== 'page') return props
  const env = c.env as unknown as Env
  const year = props.year ?? appPageYears(props.data)[0]
  if (year === undefined) return props
  try {
    const entry = (await catalog(env)).find((e) => e.code === props.data.code)
    if (!entry) return props
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('snapshot deadline')), SNAPSHOT_WAIT_MS)))
    const snapshot = await Promise.race([loadYearSnapshot(env, entry, year, { field: props.field }), deadline]).finally(() => clearTimeout(timer))
    return { ...props, snapshot }
  } catch {
    // API に繋がらない・待ちきれなければ本文の無い頁を返し、画面が取り直す。本文の無い頁は CDN にもブラウザにも置かない
    c.header('x-revalidate', '0')
    c.header('Cache-Control', 'no-store')
    return props
  }
}

/** 分野の頁とタブの頁は、題・説明文・canonical をその頁のものにする */
export const jurisdictionHead = (p: JurisdictionProps): Head => {
  if (p.kind !== 'page') return emptyHead(p.entry)
  return pageHead(p.data, p.year, p.field ? { field: p.field } : p.tab ? { tab: p.tab } : undefined)
}

/** 最後の節に出す近くの自治体の数 */
const NEARBY_COUNT = 3

/** 近い順の自治体。都道府県の図（map.generated.ts）のタイルの位置で測り、図の無い自治体は自治体コードの近さで測る */
function nearby(entry: CatalogEntry, candidates: CatalogEntry[]): CatalogEntry[] {
  const tiles = new Map<string, { col: number; row: number }>(PREFECTURE_MAPS.flatMap((m) => m.tiles.map((t) => [t.code, t] as const)))
  const here = tiles.get(entry.code)
  const distance = (e: CatalogEntry) => {
    const t = tiles.get(e.code)
    return here && t ? Math.hypot(t.col - here.col, t.row - here.row) : 1e3 + Math.abs(Number(e.code) - Number(entry.code))
  }
  return candidates.map((e) => ({ e, d: distance(e) })).sort((a, b) => a.d - b.d || a.e.code.localeCompare(b.e.code)).slice(0, NEARBY_COUNT).map((x) => x.e)
}

/** 個別ページに出すもの。収録の無い自治体は empty、存在しない名称や都道府県の slug でない path は null（404） */
export type JurisdictionView = { kind: 'page'; data: PageData } | { kind: 'empty'; entry: CatalogEntry; neighbors: PageData['neighbors'] }

/** /<都道府県のローマ字>/<自治体のローマ字>、都道府県自体は /<都道府県のローマ字>。API に繋がらなければ投げる */
export async function resolveJurisdiction(env: Env, path: string): Promise<JurisdictionView | null> {
  if (!PREFECTURE_SLUGS.has(path.split('/')[1] ?? '')) return null
  const entries = await catalog(env)
  const entry = entries.find((e) => jurisdictionPath(e.code) === path)
  if (!entry) return null
  // 都道府県名は都道府県自体の頁へ。都道府県自体の頁と、都道府県がカタログに無い（頁が無い）ときはリンクしない
  const prefectureCode = prefectureCodeOf(entry.code)
  const prefecturePath = entry.code !== prefectureCode && entries.some((e) => e.code === prefectureCode) ? jurisdictionPath(prefectureCode) : null
  const neighbors = nearby(entry, entries.filter((e) => e.code.slice(0, 2) === entry.code.slice(0, 2) && e.code !== entry.code && e.code !== prefectureCode && e.settlementYears.length > 0))
    .map((e) => ({ code: e.code, name: e.name, path: jurisdictionPath(e.code), ...(EMBLEMS[e.code] ? { logo: assetPath(e.code, 'emblem.svg') } : {}) }))
  const data = entry.settlementYears.length > 0 ? await pageData(env, entry) : null
  return data ? { kind: 'page', data: { ...data, prefecturePath, ...(prefecturePath && EMBLEMS[prefectureCode] ? { prefectureLogo: assetPath(prefectureCode, 'emblem.svg') } : {}), emblem: emblemOf(entry.code), neighbors, vision: VISIONS[entry.code] ?? null, ...(entry.accounts ? { accounts: entry.accounts } : {}) } } : { kind: 'empty', entry, neighbors }
}
