// 自治体の個別ページ（/tokyo/nakano）・ホームの自治体の要約のデータと、画面が款・目の内訳を引く /data/jurisdictions/*・sitemap の応答。
// データは apps/api の歳出の検索から組み、応答ごと CDN に置く（Worker の中には置かない）。頁は pages/ の loader が、
// 内訳の API と sitemap は routes/ がここを呼ぶ。内訳の API は誰でも読める GET で、IP ごとの流量と id の形の検査で守る
import { sitemapXml } from '../jurisdiction/html'
import { jurisdictionPath } from '../jurisdiction/path'
import { toMapEntry, type MapEntry } from '../jurisdiction/index-table'
import { type FlowDepth, type FlowView, type IndexEntry, type PageData } from '../jurisdiction/types'
import { assetPath, EMBLEMS } from '../jurisdiction/emblems'
import { clientIp, errorResponse, HttpError, rateLimit } from './http'
import { VIEW_RATE_LIMIT } from './limits'
import type { Env, Fetcher, RateLimiter } from './env'
import type { OgInput } from './og'
import { appYears, loadYearSnapshot } from './app-data'
import { ACCOUNT, loadAccountTotals, loadCatalog, loadCofogFlow, loadDrillById, loadFlow, loadIndex, loadPage, loadSetsu, type CatalogEntry, type DocumentKind } from './jurisdiction'

const TTL = 3600
const NODE_ID = /^[0-9a-f]{64}$/

// 応答は CDN（Void の ISR、void.config.ts の routing.revalidate）に置く。Worker の中には置かず、毎回 API から組む
export const catalog = (env: Env) => loadCatalog(env)
const index = async (env: Env) => loadIndex(env, await catalog(env), jurisdictionPath)
/** 自治体の頁と OG 画像が共有する、最新の決算の年度の頁のデータ */
export const pageData = (env: Env, e: CatalogEntry): Promise<Omit<PageData, 'prefecturePath' | 'prefectureLogo' | 'emblem' | 'neighbors'> | null> => loadPage(env, e)

/** ホーム（/）に載せる全自治体の要約 */
export async function homeEntries(env: Env): Promise<MapEntry[]> {
  const [entries, jurisdictions] = await Promise.all([index(env), catalog(env)])
  const latest = new Map(jurisdictions.map((j) => [j.code, pageYearsOf(j)[0]]))
  return entries.map((e) => toMapEntry(e, latest.get(e.code)))
}

/** 自治体の頁で選べる年度（新しい順）。頁のデータを読まずにカタログだけで決める（sitemap・ホームのリンク） */
export const pageYearsOf = (e: CatalogEntry): number[] => appYears(e).map((y) => y.year)

/** OG 画像（server/og.ts）に描くもの。紋章が無い・決算が無い・分野の金額が無い自治体は null（404 にして全頁共通の画像のままにする）。
 * 帰属表示の要る紋章（CC BY など）は、描き起こした人とライセンスを画像の隅に書く */
export async function ogInput(env: Env, code: string, assets: Fetcher): Promise<OgInput | null> {
  const emblem = EMBLEMS[code]
  if (!emblem) return null
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
    ...(emblem.author ? { credit: `紋章の SVG 化: ${emblem.author} / ${emblem.license}` } : {}),
  }
}

/** 収録のある自治体の頁を含む sitemap。API に繋がらなくても入口・一覧・アシスタントだけで答える */
export async function sitemapResponse(env: Env): Promise<Response> {
  try {
    return new Response(sitemapXml(await catalog(env), pageYearsOf), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
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

/** 款・項の内訳（/data/jurisdictions/drill/:id） */
export const drillResponse = (env: Env, request: Request, id: string) => guarded(env, request, id, () => loadDrillById(env, id))
/** 目の節（/data/jurisdictions/setsu/:id） */
export const setsuResponse = (env: Env, request: Request, id: string) => guarded(env, request, id, () => loadSetsu(env, id))

/** 一つの自治体・年度の全款の流れ（/data/jurisdictions/flow/:code/:year/:depth）。?view=cofog なら分野 → 款の流れ */
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
    return json(await load(env, code, Number(year), depth as FlowDepth, kind, account))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '決算データを表示できませんでした。少し待ってからもう一度開いてください。'))
  }
}

/** 一つの自治体・年度の会計ごとの総額（/data/jurisdictions/accounts/:code/:year）。?phase=initial なら当初予算 */
export async function accountsResponse(env: Env, request: Request, { code, year }: { code: string; year: string }): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(year)) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体・年度の指定が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const kind: DocumentKind = new URL(request.url).searchParams.get('phase') === 'initial' ? 'initial' : 'settlement'
    const accounts = (await catalog(env)).find((e) => e.code === code)?.accounts?.[kind]?.[year]
    if (!accounts?.length) throw new HttpError(404, 'NOT_FOUND', 'この自治体・年度の資料は収録されていません')
    return json(await loadAccountTotals(env, code, Number(year), kind, accounts))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

/** 頁の1年度のデータ（/data/jurisdictions/app/:code/:year）。年度の無い /data/jurisdictions/app/:code は最新の年度（ホームのまちの札） */
export async function appDataResponse(env: Env, request: Request, code: string, yearParam?: string): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コードの形が違います')
    if (yearParam !== undefined && !/^\d{4}$/.test(yearParam)) throw new HttpError(400, 'INVALID_ARGUMENT', '年度の形が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const entry = (await catalog(env)).find((e) => e.code === code)
    if (!entry) throw new HttpError(404, 'NOT_FOUND', 'この自治体は収録されていません')
    const year = yearParam === undefined ? appYears(entry)[0]?.year : Number(yearParam)
    if (year === undefined || !appYears(entry).some((y) => y.year === year)) throw new HttpError(404, 'NOT_FOUND', 'この年度は頁にありません')
    return json(await loadYearSnapshot(env, entry, year, { evaluated: yearParam === undefined }))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}
