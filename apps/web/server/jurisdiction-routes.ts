// 自治体の個別ページ（/tokyo/nakano）・ホームの自治体の要約のデータと、自治体の検索（/api/jurisdictions）・sitemap の応答。
// データは apps/api の歳出の検索から組む。頁は pages/ の loader が呼んで CDN に置き、/api/jurisdictions と sitemap は routes/ が呼ぶ。
// /api/jurisdictions は誰でも読める GET で、IP ごとの流量と引数の形の検査で守る（CDN には置かない）
import { sitemapXml } from '../jurisdiction/html'
import { jurisdictionPath } from '../jurisdiction/path'
import type { MapEntry } from '../jurisdiction/index-table'
import { jurisdictionKind, type PageData } from '../jurisdiction/types'
import { assetPath, EMBLEMS } from '../jurisdiction/emblems'
import { clientIp, errorResponse, HttpError, rateLimit } from './http'
import { VIEW_RATE_LIMIT } from './limits'
import type { Env, Fetcher, RateLimiter } from './env'
import type { OgInput } from './og'
import { appYears, loadFieldSubjects, loadYearSnapshot } from './app-data'
import { loadCatalog, loadCatalogEntry, loadSettlementSummary, searchCatalog, type CatalogEntry } from './jurisdiction'
import { FudokiApiError } from './fudoki-api'

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

/** ホーム（/）とサイドバーの検索に載せる、決算を収録している自治体 */
export async function homeEntries(env: Env): Promise<MapEntry[]> {
  return (await catalog(env))
    .filter((e) => e.settlementYears.length > 0)
    .map(toMapEntry)
}

/** 自治体の頁で選べる年度（新しい順）。頁のデータを読まずにカタログだけで決める（sitemap・ホームのリンク） */
export const pageYearsOf = (e: CatalogEntry): number[] => appYears(e).map((y) => y.year)

/** OG 画像（server/og.ts）に描くもの。紋章が無い・決算が無い・分野の金額が無い自治体は null（404 にして全頁共通の画像のままにする）。
 * 帰属表示の要る紋章（CC BY など）は、描き起こした人とライセンスを画像の隅に書く */
export async function ogInput(env: Env, code: string, assets: Fetcher): Promise<OgInput | null> {
  const emblem = EMBLEMS[code]
  if (!emblem) return null
  const entry = await loadCatalogEntry(env, code)
  const latest = entry?.settlementYears.at(-1)
  const summary = entry && latest !== undefined ? await loadSettlementSummary(env, code, latest) : null
  const areas = summary?.areas.map((a) => ({ name: a.name, yen: a.yen })) ?? []
  if (!entry || !summary || areas.length === 0) return null
  const asset = async (path: string) => {
    const r = await assets.fetch(new Request(`https://fudoki.dev${path}`))
    if (!r.ok) throw new Error(`${path} が読めません（${r.status}）`)
    return r.text()
  }
  const [emblemSvg, logoSvg] = await Promise.all([asset(assetPath(code, 'emblem.svg')), asset('/logo.svg')])
  return {
    name: entry.name,
    prefecture: code.slice(2, 5) === '000' ? null : entry.prefecture,
    year: summary.year,
    total: summary.yen,
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

/** 町の検索で一度に返す数 */
const TOWN_PAGE = 10
/** 探す語の長さの上限 */
const QUERY_MAX = 50
/** 続きの印（api の page_token）の長さの上限 */
const CURSOR_MAX = 512
/** /api の応答はブラウザにだけ少し置く（CDN は /api を置かない） */
const BROWSER_CACHE = 'public, max-age=300'

/** 一覧の1件を、検索の候補の形にする */
const toMapEntry = (e: CatalogEntry): MapEntry => ({ code: e.code, name: e.name, prefecture: e.prefecture, kind: jurisdictionKind(e.code, e.name), path: jurisdictionPath(e.code), latestYear: pageYearsOf(e)[0] })

/** 町を探す（/api/jurisdictions?q=&cursor=）。決算を収録した自治体を名前で探し、api の頁送り（list_jurisdictions の page_token）のまま TOWN_PAGE 件ずつ返す。
 * 一覧を全部は読まない。next は続きの cursor（無ければ null）。?code= ならその自治体だけを配列で返す（うちのまちの名前を引く） */
export async function jurisdictionSearchResponse(env: Env, request: Request): Promise<Response> {
  try {
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const params = new URL(request.url).searchParams
    const code = params.get('code')
    const q = (params.get('q') ?? '').trim()
    const cursor = params.get('cursor') ?? undefined
    if ((code !== null && !/^\d{6}$/.test(code)) || q.length > QUERY_MAX || (cursor !== undefined && (cursor.length > CURSOR_MAX || !/^[A-Za-z0-9_-]+$/.test(cursor)))) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コード・探す語・続きの印の形が違います')
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': BROWSER_CACHE } })
    // 決算が一般会計の外にしか無い自治体は、頁に年度が無いので出さない
    const shown = (e: CatalogEntry) => e.settlementYears.length > 0
    if (code !== null) return json((await searchCatalog(env, { code, pageSize: 1 })).entries.filter(shown).map(toMapEntry))
    const page = await searchCatalog(env, { ...(q ? { name: q } : {}), pageSize: TOWN_PAGE, ...(cursor ? { pageToken: cursor } : {}) })
    return json({ entries: page.entries.filter(shown).map(toMapEntry), next: page.next })
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    if (e instanceof FudokiApiError && e.status === 400) return errorResponse(new HttpError(400, 'INVALID_ARGUMENT', '続きの印が古いか、形が違います'))
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

/** 分野ごとの末端の科目（/api/jurisdictions/:code/:year/field-subjects?kind=）。やめた事業を分野で絞るときに、前の年度の分を読む。
 * 資料の種類は画面が持っているので受け取り、自治体の収録は読まない（収録の無い年度は空で返る）。誰でも呼べるので IP ごとの流量と形の検査で守る */
export async function fieldSubjectsResponse(env: Env, request: Request, code: string, yearText: string): Promise<Response> {
  try {
    const kind = new URL(request.url).searchParams.get('kind')
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(yearText) || (kind !== 'initial' && kind !== 'settlement')) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コード・年度・資料の形が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    return new Response(JSON.stringify(await loadFieldSubjects(env, code, Number(yearText), kind)), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': BROWSER_CACHE } })
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}
