// 自治体の個別ページ（/tokyo/nakano）・一覧（/jurisdictions）のデータと、画面が款・目の内訳を引く /api/jurisdictions/*・sitemap の応答。
// データは apps/api の歳出の検索から組み、変わるのは取り込みのときだけなので、Worker の cache に1時間置く。頁は pages/ の loader が、
// 内訳の API と sitemap は routes/ がここを呼ぶ。内訳の API は誰でも読める GET で、IP ごとの流量と id の形の検査で守る
import { PREFECTURE_MAPS } from '../jurisdiction/map.generated'
import { sitemapXml } from '../jurisdiction/html'
import { jurisdictionPath, PREFECTURE_SLUGS } from '../jurisdiction/path'
import { DEFAULT_INDEX_QUERY, parseIndexQuery, queryIndex, toMapEntry, type IndexTable, type MapEntry } from '../jurisdiction/index-table'
import { INDEX_PATH, pageYears, type Drill, type FlowDepth, type FlowView, type IndexEntry, type PageData, type Setsu } from '../jurisdiction/types'
import { assetPath, PROFILES, type Profile } from '../jurisdiction/profiles'
import { EMBLEMS } from '../jurisdiction/emblems'
import { BUDGET_PRESS } from '../jurisdiction/budget-press'
import { clientIp, errorResponse, HttpError, rateLimit } from './http'
import { VIEW_RATE_LIMIT } from './limits'
import type { Env, RateLimiter } from './env'
import { loadCatalog, loadCofogFlow, loadDrillById, loadFlow, loadIndex, loadPage, loadSetsu, type CatalogEntry, type DocumentKind } from './jurisdiction'

const TTL = 3600
const NODE_ID = /^[0-9a-f]{64}$/
/** Worker の cache（無い環境では毎回取り直す）。同じ isolate の中でも一度だけ取る */
const inflight = new Map<string, Promise<unknown>>()
async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const url = `https://fudoki.dev/__cache/jurisdiction-v19/${key}`
  const cache = typeof caches === 'undefined' ? undefined : (caches as unknown as { default?: Cache }).default
  const hit = await cache?.match(url)
  if (hit) return (await hit.json()) as T
  const pending = inflight.get(key) ?? fn().finally(() => inflight.delete(key))
  inflight.set(key, pending)
  const value = (await pending) as T
  await cache?.put(url, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TTL}` } }))
  return value
}

export const catalog = (env: Env) => memo<CatalogEntry[]>('catalog', () => loadCatalog(env))
// catalog とは別の key で同じ TTL（1時間）を持つので、取り込みで自治体が増えてから一覧へ出るまで最大で約2時間かかる
const index = (env: Env) => memo<IndexEntry[]>('index', async () => loadIndex(env, await catalog(env), jurisdictionPath))
const page = (env: Env, e: CatalogEntry) => memo<Omit<PageData, 'prefecturePath' | 'neighbors'> | null>(`page-${e.code}-${e.settlementYears.at(-1)}`, () => loadPage(env, e))

/** 一覧（/jurisdictions）の頁に載せるもの。地図・検索の要約は全自治体、表は既定の並びの最初の1頁。API に繋がらなければ投げる */
export async function indexPageData(env: Env): Promise<{ map: MapEntry[]; table: IndexTable }> {
  const entries = await index(env)
  return { map: entries.map(toMapEntry), table: queryIndex(entries, DEFAULT_INDEX_QUERY) }
}

/** ホーム（/）に載せる全自治体の要約 */
export const homeEntries = async (env: Env): Promise<MapEntry[]> => (await index(env)).map(toMapEntry)

/** 比較表の続き・並べ替え・絞り込み（/api/jurisdictions/table?sort=&order=&offset=&pref=&code=）。30件ずつ返す */
export async function tableResponse(env: Env, request: Request): Promise<Response> {
  try {
    let q
    try {
      q = parseIndexQuery(new URL(request.url).searchParams)
    } catch (e) {
      throw new HttpError(400, 'INVALID_ARGUMENT', (e as Error).message)
    }
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    return json(queryIndex(await index(env), q))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
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
export type JurisdictionView = { kind: 'page'; data: PageData & { profile: Profile | null } } | { kind: 'empty'; entry: CatalogEntry }

/** /<都道府県のローマ字>/<自治体のローマ字>、都道府県自体は /<都道府県のローマ字>。API に繋がらなければ投げる */
export async function resolveJurisdiction(env: Env, path: string): Promise<JurisdictionView | null> {
  if (!PREFECTURE_SLUGS.has(path.split('/')[1] ?? '')) return null
  const entries = await catalog(env)
  const entry = entries.find((e) => jurisdictionPath(e.code) === path)
  if (!entry) return null
  // 都道府県名は都道府県自体の頁へ。都道府県自体の頁と、都道府県がカタログに無い（頁が無い）ときは一覧へ
  const prefectureCode = `${entry.code.slice(0, 2)}0001`
  const prefecturePath = entry.code !== prefectureCode && entries.some((e) => e.code === prefectureCode) ? jurisdictionPath(prefectureCode) : INDEX_PATH
  const neighbors = nearby(entry, entries.filter((e) => e.code.slice(0, 2) === entry.code.slice(0, 2) && e.code !== entry.code && e.code !== prefectureCode && e.settlementYears.length > 0))
    .map((e) => ({ code: e.code, name: e.name, path: jurisdictionPath(e.code), ...(EMBLEMS[e.code] ? { logo: assetPath(e.code, 'emblem.svg') } : {}) }))
  const data = entry.settlementYears.length > 0 ? await page(env, entry) : null
  return data ? { kind: 'page', data: { ...data, prefecturePath, neighbors, profile: withPress(entry.code, PROFILES[entry.code] ?? null) } } : { kind: 'empty', entry }
}

/** 事業評価がまだの年度に、予算案のプレス発表資料の施策（budgetNew）を足す。評価のある年度は足さない */
function withPress(code: string, profile: Profile | null): Profile | null {
  const press = BUDGET_PRESS[code]
  if (!profile || !press) return profile
  const years = Object.fromEntries(Object.entries(profile.years).map(([y, py]) => {
    const p = press[y]
    if (!p || py.projects.length || py.initiatives?.length) return [y, py]
    // 出すのは「新規」の印が付いた施策だけ。印の無い施策は拡大か継続かを資料から決められないので出さない（データには紐付けごと残す）
    return [y, { ...py, budgetPress: p.source, budgetNew: p.items.filter((i) => i.isNew) }]
  }))
  return { ...profile, years }
}

/** 収録のある自治体の頁を含む sitemap。API に繋がらなくても入口・一覧・アシスタントだけで答える */
export async function sitemapResponse(env: Env): Promise<Response> {
  try {
    return new Response(sitemapXml(await catalog(env), (e) => pageYears({ years: e.settlementYears.map((year) => ({ year })), profile: PROFILES[e.code] ?? null })), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
  } catch {
    return new Response(sitemapXml([]), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${TTL}` } })

async function guarded(env: Env, request: Request, id: string, run: () => Promise<unknown>) {
  try {
    if (!NODE_ID.test(id)) throw new HttpError(400, 'INVALID_ARGUMENT', 'id の形が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    return json(await run())
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

/** 款・項の内訳（/api/jurisdictions/drill/:id） */
export const drillResponse = (env: Env, request: Request, id: string) => guarded(env, request, id, () => memo<Drill>(`drill-${id}`, () => loadDrillById(env, id)))
/** 目の節（/api/jurisdictions/setsu/:id） */
export const setsuResponse = (env: Env, request: Request, id: string) => guarded(env, request, id, () => memo<Setsu[]>(`setsu-${id}`, () => loadSetsu(env, id)))

/** 一つの自治体・年度の全款の流れ（/api/jurisdictions/flow/:code/:year/:depth）。?view=cofog なら分野 → 款の流れ */
export async function flowResponse(env: Env, request: Request, { code, year, depth }: { code: string; year: string; depth: string }): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(year) || !['kou', 'moku', 'setsu'].includes(depth))
      throw new HttpError(400, 'INVALID_ARGUMENT', '自治体・年度・表示階層の指定が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const view: FlowView = new URL(request.url).searchParams.get('view') === 'cofog' ? 'cofog' : 'kan'
    // 決算の無い年度は当初予算を読む（?phase=initial）。決算のある年度に予算は出さない
    const kind: DocumentKind = new URL(request.url).searchParams.get('phase') === 'initial' ? 'initial' : 'settlement'
    const entry = (await catalog(env)).find((e) => e.code === code)
    const ok = kind === 'initial' ? entry?.initialYears.includes(Number(year)) && !entry.settlementYears.includes(Number(year)) : entry?.settlementYears.includes(Number(year))
    if (!ok) throw new HttpError(404, 'NOT_FOUND', kind === 'initial' ? 'この自治体・年度の決算の無い一般会計の当初予算は収録されていません' : 'この自治体・年度の一般会計の決算は収録されていません')
    const load = view === 'cofog' ? loadCofogFlow : loadFlow
    return json(await memo<Drill[]>(`flow-${view}-${kind}-${code}-${year}-${depth}`, () => load(env, code, Number(year), depth as FlowDepth, kind)))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '決算データを表示できませんでした。少し待ってからもう一度開いてください。'))
  }
}
