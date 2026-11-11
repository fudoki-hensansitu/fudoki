// 自治体の個別ページ（/tokyo/nakano）・ホームの自治体の要約のデータと、画面が款・目の内訳を引く /api/jurisdictions/*・sitemap の応答。
// データは apps/api の歳出の検索から組み、変わるのは取り込みのときだけなので、Worker の cache に1時間置く。頁は pages/ の loader が、
// 内訳の API と sitemap は routes/ がここを呼ぶ。内訳の API は誰でも読める GET で、IP ごとの流量と id の形の検査で守る
import { sitemapXml } from '../jurisdiction/html'
import { jurisdictionPath } from '../jurisdiction/path'
import { toMapEntry, type MapEntry } from '../jurisdiction/index-table'
import { appPageYears, type Drill, type FlowDepth, type FlowView, type IndexEntry, type PageData, type Setsu } from '../jurisdiction/types'
import { assetPath } from '../jurisdiction/profiles'
import { EMBLEMS } from '../jurisdiction/emblems'
import { clientIp, errorResponse, HttpError, rateLimit } from './http'
import { VIEW_RATE_LIMIT } from './limits'
import type { Env, Fetcher, RateLimiter } from './env'
import type { OgInput } from './og'
import { loadAppData } from './app-data'
import type { Snapshot } from '../jurisdiction/app/data'
import { ACCOUNT, loadAccountTotals, loadCatalog, loadCofogFlow, loadDrillById, loadFlow, loadIndex, loadPage, loadSetsu, shownSettlementYears, type CatalogEntry, type DocumentKind } from './jurisdiction'

const TTL = 3600
const NODE_ID = /^[0-9a-f]{64}$/
/** Worker の cache（無い環境では毎回取り直す）。同じ isolate の中でも一度だけ取る */
const inflight = new Map<string, Promise<unknown>>()
async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const url = `https://fudoki.dev/__cache/jurisdiction-v22/${key}`
  const cache = typeof caches === 'undefined' ? undefined : (caches as unknown as { default?: Cache }).default
  const hit = await cache?.match(url)
  if (hit) return (await hit.json()) as T
  const pending = inflight.get(key) ?? fn().finally(() => inflight.delete(key))
  inflight.set(key, pending)
  const value = (await pending) as T
  await cache?.put(url, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${TTL}` } }))
  return value
}

// 会計の一覧（accounts）を足したので key を変え、前の形のキャッシュを読まない
export const catalog = (env: Env) => memo<CatalogEntry[]>('catalog-accounts', () => loadCatalog(env))
// catalog とは別の key で同じ TTL（1時間）を持つので、取り込みで自治体が増えてからホームの検索へ出るまで最大で約2時間かかる
const index = (env: Env) => memo<IndexEntry[]>('index', async () => loadIndex(env, await catalog(env), jurisdictionPath))
/** 自治体の頁と OG 画像が共有する、最新の決算の年度の頁のデータ */
export const pageData = (env: Env, e: CatalogEntry) => memo<Omit<PageData, 'prefecturePath' | 'neighbors'> | null>(`page-${e.code}-${e.settlementYears.at(-1)}`, () => loadPage(env, e))

/** ホーム（/）に載せる全自治体の要約 */
export const homeEntries = async (env: Env): Promise<MapEntry[]> => (await index(env)).map(toMapEntry)

/** OG 画像（server/og.ts）に描くもの。紋章が無い・決算が無い・分野の金額が無い自治体は null（404 にして全頁共通の画像のままにする） */
export async function ogInput(env: Env, code: string, assets: Fetcher): Promise<(OgInput & { cacheKey: string }) | null> {
  if (!EMBLEMS[code]) return null
  const entry = (await catalog(env)).find((e) => e.code === code)
  const data = entry && entry.settlementYears.length > 0 ? await pageData(env, entry) : null
  const areas = data?.cofogFlow.map((f) => ({ name: f.kan.name, yen: f.kan.yen })).filter((a) => a.yen > 0) ?? []
  if (!entry || !data || areas.length === 0) return null
  const asset = async (path: string) => {
    const r = await assets.fetch(new Request(`https://fudoki.dev${path}`))
    if (!r.ok) throw new Error(`${path} が読めません（${r.status}）`)
    return r.text()
  }
  const [emblemSvg, logoSvg] = await Promise.all([asset(assetPath(code, 'emblem.svg')), asset('/logo.svg')])
  const latest = data.years.at(-1)!
  return {
    name: entry.name,
    prefecture: code.slice(2, 5) === '000' ? null : entry.prefecture,
    year: latest.year,
    total: latest.yen,
    areas,
    emblemSvg,
    logoSvg,
    // 同じ年度の決算なら同じ画像。字形・配置を変えたら版を上げる
    cacheKey: `og-v1/${code}-${latest.year}-${latest.yen}`,
  }
}

/** 収録のある自治体の頁を含む sitemap。API に繋がらなくても入口・一覧・アシスタントだけで答える */
export async function sitemapResponse(env: Env): Promise<Response> {
  try {
    return new Response(sitemapXml(await catalog(env), (e) => { const settled = shownSettlementYears(e.settlementYears); const last = Math.max(0, ...settled); return appPageYears({ years: settled.map((year) => ({ year })), budgets: e.initialYears.filter((y) => y > last).map((year) => ({ year })) }) }), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
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
    // ?phase=initial なら当初予算、無ければ決算を読む
    const kind: DocumentKind = new URL(request.url).searchParams.get('phase') === 'initial' ? 'initial' : 'settlement'
    // ?account= で特別会計も読む。無ければ一般会計
    const account = new URL(request.url).searchParams.get('account') || ACCOUNT
    const entry = (await catalog(env)).find((e) => e.code === code)
    const ok = entry?.accounts?.[kind]?.[year]?.includes(account) ?? (account === ACCOUNT && (kind === 'initial' ? entry?.initialYears : entry?.settlementYears)?.includes(Number(year)))
    if (!ok) throw new HttpError(404, 'NOT_FOUND', `この自治体・年度の${account}の${kind === 'initial' ? '当初予算' : '決算'}は収録されていません`)
    const load = view === 'cofog' ? loadCofogFlow : loadFlow
    const suffix = account === ACCOUNT ? '' : `-${account}`
    return json(await memo<Drill[]>(`flow-${view}-${kind}-${code}-${year}-${depth}${suffix}`, () => load(env, code, Number(year), depth as FlowDepth, kind, account)))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '決算データを表示できませんでした。少し待ってからもう一度開いてください。'))
  }
}

/** 一つの自治体・年度の会計ごとの総額（/api/jurisdictions/accounts/:code/:year）。?phase=initial なら当初予算 */
export async function accountsResponse(env: Env, request: Request, { code, year }: { code: string; year: string }): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(year)) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体・年度の指定が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const kind: DocumentKind = new URL(request.url).searchParams.get('phase') === 'initial' ? 'initial' : 'settlement'
    const accounts = (await catalog(env)).find((e) => e.code === code)?.accounts?.[kind]?.[year]
    if (!accounts?.length) throw new HttpError(404, 'NOT_FOUND', 'この自治体・年度の資料は収録されていません')
    return json(await memo(`accounts-${kind}-${code}-${year}`, () => loadAccountTotals(env, code, Number(year), kind, accounts)))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

/** 自治体の頁（アプリ型）のデータ（/api/jurisdictions/app/:code）。年度ごとの款項目・事業・施策・評価シート */
export async function appDataResponse(env: Env, request: Request, code: string): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コードの形が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const entry = (await catalog(env)).find((e) => e.code === code)
    if (!entry) throw new HttpError(404, 'NOT_FOUND', 'この自治体は収録されていません')
    return json(await memo<Snapshot>(`app-${code}-${entry.initialYears.at(-1)}-${entry.settlementYears.at(-1)}`, () => loadAppData(env, entry)))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}
