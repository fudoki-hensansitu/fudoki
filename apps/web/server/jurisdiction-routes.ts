// 自治体の個別ページ（/:都道府県/:名称）と、画面が款・目の内訳を引く /api/jurisdictions/*。データは apps/api の歳出の検索から組み、
// 変わるのは取り込みのときだけなので、Worker の cache に1時間置く。内訳の API は誰でも読める GET で、IP ごとの流量と id の形の検査で守る
import { Hono } from 'hono'
import { renderEmpty, renderIndex, renderPage, sitemapXml } from '../jurisdiction/html'
import type { Drill, FlowDepth, PageData, Setsu } from '../jurisdiction/types'
import { clientIp, errorResponse, HttpError, rateLimit } from './http'
import { VIEW_RATE_LIMIT } from './limits'
import type { Env, RateLimiter } from './env'
import { loadCatalog, loadDrillById, loadFlow, loadPage, loadSetsu, type CatalogEntry } from './jurisdiction'

const TTL = 3600
const NODE_ID = /^[0-9a-f]{64}$/
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=300` }

/** Worker の cache（無い環境では毎回取り直す）。同じ isolate の中でも一度だけ取る */
const inflight = new Map<string, Promise<unknown>>()
async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const url = `https://fudoki.dev/__cache/jurisdiction-v3/${key}`
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
const page = (env: Env, e: CatalogEntry) => memo<PageData | null>(`page-${e.code}-${e.settlementYears.at(-1)}`, () => loadPage(env, e))

export const jurisdictions = new Hono<{ Bindings: Env }>()

const notFound = () => new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
const unavailable = () => new Response('風土記の API に繋がりませんでした。少し待ってからもう一度開いてください。\n', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

jurisdictions.get('/自治体', async (c) => {
  try {
    return new Response(renderIndex(await catalog(c.env)), { headers: HTML_HEADERS })
  } catch {
    return unavailable()
  }
})

// /<都道府県>/<自治体名>。/s/:id・/api/* など他の経路とは、都道府県名の形で見分ける（形が違えば API を引かずに次へ渡す）
const PREFECTURE = /^(北海道|.{2,3}[都府県])$/

jurisdictions.get('/:prefecture/:name', async (c, next) => {
  const { prefecture, name } = c.req.param()
  if (!PREFECTURE.test(prefecture)) return next()
  try {
    const entry = (await catalog(c.env)).find((e) => e.prefecture === prefecture && e.name === name)
    if (!entry) return notFound()
    const data = entry.settlementYears.length > 0 ? await page(c.env, entry) : null
    if (!data) return new Response(renderEmpty(entry), { headers: HTML_HEADERS })
    return new Response(renderPage(data, c.env.TURNSTILE_SITE_KEY ?? ''), { headers: HTML_HEADERS })
  } catch {
    return unavailable()
  }
})

jurisdictions.get('/sitemap.xml', async (c) => {
  try {
    return new Response(sitemapXml(await catalog(c.env)), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
  } catch {
    // API が繋がらなくても sitemap は答える（入口と一覧だけ）
    return new Response(sitemapXml([]), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
})

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${TTL}` } })

async function guarded(c: { env: Env; req: { raw: Request } }, id: string, run: () => Promise<unknown>) {
  try {
    if (!NODE_ID.test(id)) throw new HttpError(400, 'INVALID_ARGUMENT', 'id の形が違います')
    await rateLimit(c.env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(c.req.raw), VIEW_RATE_LIMIT.period)
    return json(await run())
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

jurisdictions.get('/api/jurisdictions/drill/:id', (c) => guarded(c, c.req.param('id'), () => memo<Drill>(`drill-${c.req.param('id')}`, () => loadDrillById(c.env, c.req.param('id')))))
jurisdictions.get('/api/jurisdictions/setsu/:id', (c) => guarded(c, c.req.param('id'), () => memo<Setsu[]>(`setsu-${c.req.param('id')}`, () => loadSetsu(c.env, c.req.param('id')))))

jurisdictions.get('/api/jurisdictions/flow/:code/:year/:depth', async (c) => {
  try {
    const { code, year, depth } = c.req.param()
    if (!/^\d{6}$/.test(code) || !/^\d{4}$/.test(year) || !['kou', 'moku', 'setsu'].includes(depth))
      throw new HttpError(400, 'INVALID_ARGUMENT', '自治体・年度・表示階層の指定が違います')
    await rateLimit(c.env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(c.req.raw), VIEW_RATE_LIMIT.period)
    const entry = (await catalog(c.env)).find((e) => e.code === code)
    if (!entry?.settlementYears.includes(Number(year))) throw new HttpError(404, 'NOT_FOUND', 'この自治体・年度の一般会計の決算は収録されていません')
    return json(await memo<Drill[]>(`flow-${code}-${year}-${depth}`, () => loadFlow(c.env, code, Number(year), depth as FlowDepth)))
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '決算データを表示できませんでした。少し待ってからもう一度開いてください。'))
  }
})
