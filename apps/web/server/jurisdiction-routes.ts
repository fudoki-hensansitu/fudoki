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
import { appYears, loadFieldSubjects, loadYearExtras, loadYearSnapshot } from './app-data'
import { ACCOUNT, loadCatalog, loadCatalogEntry, loadSetsu, loadSettlementSummary, type CatalogEntry } from './jurisdiction'

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

/** 頁の1年度の、最初の画面に要らない分（extras）と、分野ごとの末端の科目（field-subjects）。/api/jurisdictions/:code/:year/<part> が返す。
 * 誰でも呼べるので IP ごとの流量と形の検査で守り、資料の種類は自治体の収録から決める（頁に無い自治体・年度は 404） */
export async function yearPartResponse(env: Env, request: Request, code: string, yearText: string, part: 'extras' | 'field-subjects'): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(yearText)) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コードか年度の形が違います')
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const entry = await loadCatalogEntry(env, code)
    const me = entry && appYears(entry).find((y) => y.year === Number(yearText))
    if (!entry || !me) throw new HttpError(404, 'NOT_FOUND', 'この年度は頁にありません')
    const body = part === 'extras' ? await loadYearExtras(env, code, me.year, me.kind) : await loadFieldSubjects(env, code, me.year, me.kind)
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': BROWSER_CACHE } })
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

/** 予算・決算のタブの流れの図の、目ごとの節（/api/jurisdictions/:code/:year/setsu/:phase[/:account]）。収録の無い年度・資料・会計は 404 */
export async function setsuResponse(env: Env, request: Request, code: string, yearText: string, phase: string, accountParam?: string): Promise<Response> {
  try {
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(yearText) || (phase !== 'initial' && phase !== 'settlement')) throw new HttpError(400, 'INVALID_ARGUMENT', '自治体コード・年度・資料の形が違います')
    // 会計の名前は path の1段。router が % を戻していなければ戻す
    let account = accountParam || ACCOUNT
    if (account.includes('%')) try { account = decodeURIComponent(account) } catch { throw new HttpError(400, 'INVALID_ARGUMENT', '会計の形が違います') }
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    const entry = await loadCatalogEntry(env, code)
    const year = Number(yearText)
    const years = phase === 'initial' ? entry?.initialYears : entry?.settlementYears
    if (!entry || !years?.includes(year) || (account !== ACCOUNT && !entry.accounts?.[phase]?.[yearText]?.includes(account))) throw new HttpError(404, 'NOT_FOUND', 'この年度・資料・会計は収録していません')
    return new Response(JSON.stringify(await loadSetsu(env, code, year, phase, account)), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': BROWSER_CACHE } })
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}
