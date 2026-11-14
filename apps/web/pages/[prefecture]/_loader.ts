// 自治体の頁（/tokyo、/tokyo/nakano と、その下の年度・タブ・分野の頁）の loader が使う props と head。pages/[prefecture]/ の下の .server.ts だけが読む。
// Void は pages/ の下の `_` で始まるファイルを頁にしない。データの取得と cache は server/jurisdiction-routes.ts（OG 画像・sitemap と共有）
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { emptyHead, pageHead, type Head } from '../../jurisdiction/html'
import { appPageYears, hasTab, tabOfSlug, type Headline, type PageData, type PageFlow, type PageTab } from '../../jurisdiction/types'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../../jurisdiction/domains'
import { PREFECTURE_MAPS } from '../../jurisdiction/map.generated'
import { codeOfPath, jurisdictionPath } from '../../jurisdiction/path'
import { assetPath, EMBLEMS, emblemOf, prefectureCodeOf } from '../../jurisdiction/emblems'
import { VISIONS } from '../../jurisdiction/visions'
import type { Env } from '../../server/env'
import type { CatalogEntry } from '../../server/jurisdiction'
import { ACCOUNT, loadCatalog, loadCatalogEntry, loadFlowParts, loadSettlementSummary, pageBase } from '../../server/jurisdiction'
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
  /** 予算・決算のタブの頁（/tokyo/nakano/2025/settlement?account=…）の流れ。API に繋がらなければ無く、画面が読み直しを出す */
  flow?: PageFlow
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
/** 予算・決算の流れ（目の内訳まで）を待つ上限 */
const FLOW_WAIT_MS = 6000

const within = <T,>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('deadline')), ms)))
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer))
}

/** 開いた年度の款項目・施策・評価シート・事業の一覧の1頁目を props に足す（年度の段が無ければ最新の年度）。予算・決算のタブの頁なら、その流れも足す */
async function withSnapshot(c: Context, props: JurisdictionProps): Promise<JurisdictionProps> {
  if (props.kind !== 'page') return props
  const env = c.env as unknown as Env
  const year = props.year ?? appPageYears(props.data)[0]
  if (year === undefined) return props
  const entry = ENTRY_OF.get(props.data)
  // 流れの会計は ?account= で選ぶ。無ければ一般会計。収録の無い会計は 404
  const phase = props.tab === 'money' ? 'initial' : props.tab === 'settled' ? 'settlement' : undefined
  const account = new URL(c.req.url).searchParams.get('account') || ACCOUNT
  // 会計で中身の変わらない頁（予算・決算のタブ以外）の ?account= も 404 にして、CDN の key（void.config.ts の revalidateQueryAllowlist）を増やさせない
  if (account !== ACCOUNT && (!phase || (entry && !entry.accounts?.[phase]?.[String(year)]?.includes(account)))) throw new HTTPException(404, { res: notFound() })
  // 入口（最新の年度の頁）の題・説明文は、最新の決算と、決算より後の最新の当初予算の金額を書く。開いた年度の分は本文から作り、
  // 当初予算の年度を開いたときの最新の決算だけを本文と同じ段で読む
  const latestSettled = props.data.settlementYears.at(-1)
  const newest = year === appPageYears(props.data)[0]
  const [snapshot, flow, settledSummary] = await Promise.all([
    entry ? within(loadYearSnapshot(env, entry, year, { field: props.field, tab: props.tab ?? 'overview' }), SNAPSHOT_WAIT_MS).catch(() => undefined) : undefined,
    entry && phase ? within(loadFlowParts(env, entry.code, year, 'setsu', phase, account), FLOW_WAIT_MS)
      // 款が1つも無い流れは読めなかったものとして扱う（CDN に置かず、画面が読み直しを出す）
      .then(({ drills, loose }): PageFlow | undefined => (drills.length ? { year, phase, account, drills, loose } : undefined))
      .catch(() => undefined) : undefined,
    newest && latestSettled !== undefined && latestSettled !== year ? within(loadSettlementSummary(env, props.data.code, latestSettled), SNAPSHOT_WAIT_MS).catch(() => undefined) : undefined,
  ])
  const opened = snapshot?.years[String(year)]
  const headline: Headline | undefined = newest
    ? {
        ...(settledSummary ? { settlement: settledSummary } : opened && opened.kind === 'settlement' ? { settlement: { year, yen: opened.total, areas: areasOfFields(opened.fields) } } : {}),
        ...(opened && opened.kind === 'initial' && opened.total > 0 ? { budget: { year, yen: opened.total } } : {}),
      }
    : undefined
  if (!snapshot || (phase && !flow)) {
    // API に繋がらない・待ちきれなければ、読めた分だけの頁を返し、画面が読み直す。欠けた頁は CDN にもブラウザにも置かない
    c.header('x-revalidate', '0')
    c.header('Cache-Control', 'no-store')
  }
  return { ...props, ...(headline ? { data: { ...props.data, headline } } : {}), ...(snapshot ? { snapshot } : {}), ...(flow ? { flow } : {}) }
}

/** 本文の分野ごとの和（目の和）を、分野の流れ（loadSettlementSummary の areas）と同じ並び（大きい順、「その他」は最後）にする */
const areasOfFields = (fields: Record<string, number>) =>
  [...DOMAIN_FRAMES, OTHER_FRAME]
    .map((f) => ({ name: f.name, yen: fields[f.id] ?? 0, other: f.id === OTHER_FRAME.id }))
    .filter((a) => a.yen > 0)
    .sort((a, b) => Number(a.other) - Number(b.other) || b.yen - a.yen)

/** 分野の頁とタブの頁は、題・説明文・canonical をその頁のものにする */
export const jurisdictionHead = (p: JurisdictionProps): Head => {
  if (p.kind !== 'page') return emptyHead(p.entry)
  const year = p.year ?? appPageYears(p.data)[0]
  const opened = year === undefined ? undefined : p.snapshot?.years[String(year)]
  return pageHead(p.data, p.year, p.field ? { field: p.field } : p.tab ? { tab: p.tab } : undefined, opened && year !== undefined ? { year, kind: opened.kind, yen: opened.total, originTitle: opened.originTitle, areas: areasOfFields(opened.fields) } : undefined)
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
  const code = codeOfPath(path)
  if (!code) return null
  // 自分の1件と、近隣に並べる同じ都道府県の自治体を並べて読む。全国の一覧は読まない
  const prefectureCode = prefectureCodeOf(code)
  const [entry, entries] = await Promise.all([loadCatalogEntry(env, code), loadCatalog(env, code.slice(0, 2), false)])
  if (!entry) return null
  // 都道府県の頁はある前提でリンクする（都道府県自体の頁ではリンクしない）
  const prefecturePath = entry.code !== prefectureCode ? jurisdictionPath(prefectureCode) : null
  // 都道府県自体の頁には、その都道府県で収録のある自治体を全部並べる（検索エンジンが都道府県の頁からすべての自治体の頁を辿れるように）
  const samePrefecture = entries.filter((e) => e.code !== entry.code && e.code !== prefectureCode && e.settlementYears.length > 0)
  const neighbors = (entry.code === prefectureCode ? [...samePrefecture].sort((a, b) => a.code.localeCompare(b.code)) : nearby(entry, samePrefecture))
    .map((e) => ({ code: e.code, name: e.name, path: jurisdictionPath(e.code), ...(EMBLEMS[e.code] ? { logo: assetPath(e.code, 'emblem.svg') } : {}) }))
  const data = pageBase(entry)
  if (!data) return { kind: 'empty', entry, neighbors }
  const page: PageData = { ...data, prefecturePath, ...(prefecturePath && EMBLEMS[prefectureCode] ? { prefectureLogo: assetPath(prefectureCode, 'emblem.svg') } : {}), emblem: emblemOf(entry.code), neighbors, vision: VISIONS[entry.code] ?? null }
  ENTRY_OF.set(page, entry)
  return { kind: 'page', data: page }
}

/** 頁のデータを作ったときの自治体の収録範囲。本文（withSnapshot）が読み直さずに使う。props には載せない（画面に送らない） */
const ENTRY_OF = new WeakMap<PageData, CatalogEntry>()
