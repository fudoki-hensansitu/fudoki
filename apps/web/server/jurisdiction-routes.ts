// 自治体の個別ページ（/tokyo/nakano）・ホームの自治体の要約のデータと、自治体の検索（/api/jurisdictions）・sitemap の応答。
// データは apps/api の歳出の検索から組む。頁は pages/ の loader が呼んで CDN に置き、/api/jurisdictions と sitemap は routes/ が呼ぶ。
// /api/jurisdictions は誰でも読める GET で、IP ごとの流量と引数の形の検査で守る（CDN には置かない）
import { sitemapXml } from '../jurisdiction/html'
import { jurisdictionPath } from '../jurisdiction/path'
import { townMatches, type MapEntry } from '../jurisdiction/index-table'
import { jurisdictionKind, type PageData } from '../jurisdiction/types'
import { assetPath, EMBLEMS } from '../jurisdiction/emblems'
import { clientIp, errorResponse, HttpError, rateLimit } from './http'
import { VIEW_RATE_LIMIT } from './limits'
import type { Env, Fetcher, RateLimiter } from './env'
import type { OgInput } from './og'
import { appYears, loadYearSnapshot } from './app-data'
import { loadCatalog, loadCatalogEntry, loadPage, type CatalogEntry } from './jurisdiction'

// 応答は CDN（Void の ISR、void.config.ts の routing.revalidate）に置く。Worker の中には置かず、毎回 API から組む。
// 自治体の一覧だけは、1つの頁を組むあいだに何度も引くので、同じ isolate の中で1分だけ使い回す
const CATALOG_REUSE_MS = 60_000
const catalogMemo = new WeakMap<Env, { at: number; p: Promise<CatalogEntry[]> }>()
export const catalog = (env: Env) => {
  const hit = catalogMemo.get(env)
  if (hit && Date.now() - hit.at < CATALOG_REUSE_MS) return hit.p
  const p = loadCatalog(env)
  catalogMemo.set(env, { at: Date.now(), p })
  p.catch(() => catalogMemo.get(env)?.p === p && catalogMemo.delete(env))
  return p
}
/** 自治体の頁と OG 画像が共有する、最新の決算の年度の頁のデータ */
export const pageData = (env: Env, e: CatalogEntry): Promise<Omit<PageData, 'prefecturePath' | 'prefectureLogo' | 'emblem' | 'neighbors'> | null> => loadPage(env, e)

/** ホーム（/）とサイドバーの検索に載せる、決算を収録している自治体 */
export async function homeEntries(env: Env): Promise<MapEntry[]> {
  return (await catalog(env))
    .filter((e) => e.settlementYears.length > 0)
    .map((e) => ({ code: e.code, name: e.name, prefecture: e.prefecture, kind: jurisdictionKind(e.code, e.name), path: jurisdictionPath(e.code), latestYear: pageYearsOf(e)[0] }))
}

/** 自治体の頁で選べる年度（新しい順）。頁のデータを読まずにカタログだけで決める（sitemap・ホームのリンク） */
export const pageYearsOf = (e: CatalogEntry): number[] => appYears(e).map((y) => y.year)

/** OG 画像（server/og.ts）に描くもの。紋章が無い・決算が無い・分野の金額が無い自治体は null（404 にして全頁共通の画像のままにする）。
 * 帰属表示の要る紋章（CC BY など）は、描き起こした人とライセンスを画像の隅に書く */
export async function ogInput(env: Env, code: string, assets: Fetcher): Promise<OgInput | null> {
  const emblem = EMBLEMS[code]
  if (!emblem) return null
  const entry = await loadCatalogEntry(env, code)
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

/** 町の検索に返す数 */
const TOWN_LIMIT = 10
/** 探す語の長さの上限 */
const QUERY_MAX = 50
/** /api の応答はブラウザにだけ少し置く（CDN は /api を置かない） */
const BROWSER_CACHE = 'public, max-age=300'

/** 町を探す（/api/jurisdictions?q=）。語に当たる自治体を上位 TOWN_LIMIT 件だけ返す。?code= ならその自治体だけ（うちのまちの名前を引く） */
export async function jurisdictionSearchResponse(env: Env, request: Request): Promise<Response> {
  try {
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const params = new URL(request.url).searchParams
    const code = params.get('code')
    const q = params.get('q') ?? ''
    if ((code !== null && !/^\d{6}$/.test(code)) || q.length > QUERY_MAX) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コードか探す語の形が違います')
    const entries = await homeEntries(env)
    const hits = code !== null ? entries.filter((e) => e.code === code) : entries.filter((e) => townMatches(e, q)).sort((a, b) => Number(b.name.startsWith(q.trim())) - Number(a.name.startsWith(q.trim()))).slice(0, TOWN_LIMIT)
    return new Response(JSON.stringify(hits), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': BROWSER_CACHE } })
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

/** 頁の1年度のデータ。ホームのうちのまちの札（/api/jurisdictions/:code?year=）が読む。年度が無ければ最新の年度と、評価のある最新の年度の評価シート */
export async function jurisdictionSnapshotResponse(env: Env, request: Request, code: string): Promise<Response> {
  try {
    const yearParam = new URL(request.url).searchParams.get('year') ?? undefined
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コードの形が違います')
    if (yearParam !== undefined && !/^\d{4}$/.test(yearParam)) throw new HttpError(400, 'INVALID_ARGUMENT', '年度の形が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const entry = await loadCatalogEntry(env, code)
    if (!entry) throw new HttpError(404, 'NOT_FOUND', 'この自治体は収録されていません')
    const year = yearParam === undefined ? appYears(entry)[0]?.year : Number(yearParam)
    if (year === undefined || !appYears(entry).some((y) => y.year === year)) throw new HttpError(404, 'NOT_FOUND', 'この年度は頁にありません')
    return new Response(JSON.stringify(await loadYearSnapshot(env, entry, year, { evaluated: yearParam === undefined })), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': BROWSER_CACHE } })
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}
