import { describe, expect, test } from 'bun:test'
import { changePct, formatYen, kanChanges, reiwa, type YearTotal } from '../jurisdiction/types'
import web from '../worker'
import { searchInput } from '../../api/src/search'
import type { Env } from './env'

describe('金額と年度の表記', () => {
  test('1億円以上は億円、未満は万円。100億円以上は小数を出さない', () => {
    expect(formatYen(58_443_843_520)).toBe('584億円')
    expect(formatYen(9_147_986_681)).toBe('91.5億円')
    expect(formatYen(355_826_620)).toBe('3.6億円')
    expect(formatYen(76_543_210)).toBe('7,654万円')
  })
  test('西暦を令和にする', () => {
    expect(reiwa(2025)).toBe('令和7年度')
    expect(reiwa(2019)).toBe('令和元年度')
    expect(reiwa(2018)).toBe('2018年度')
  })
  test('前の年度が無い・0 のときは増減を出さない', () => {
    expect(changePct(110, 100)).toBeCloseTo(10)
    expect(changePct(50, null)).toBeNull()
    expect(changePct(50, 0)).toBeNull()
  })
  test('款の増減は前年の同じ款だけを比べ、未収録年度を飛び越えない', () => {
    const year = (year: number, amounts: Record<string, number>): YearTotal => ({
      year,
      yen: Object.values(amounts).reduce((sum, yen) => sum + yen, 0),
      kan: Object.entries(amounts).map(([name, yen]) => ({ id: name, name, yen, page: null })),
    })
    const latest = year(2025, { 民生費: 120, 総務費: 50, 教育費: 100, 衛生費: 20 })
    expect(kanChanges([year(2023, { 民生費: 100 }), latest])).toEqual([])
    expect(kanChanges([year(2023, { 民生費: 60 }), year(2024, { 民生費: 100, 総務費: 100, 教育費: 0 }), latest])).toEqual([
      { name: '民生費', pct: 20 },
      { name: '総務費', pct: -50 },
    ])
    expect(kanChanges([latest])).toEqual([])
    expect(kanChanges([])).toEqual([])
  })
})

const id = (n: number) => n.toString(16).padStart(64, '0')
type Row = Record<string, unknown> & { node_id: string; fiscal_year: number }
const node = (over: Record<string, unknown>): Row => ({ document_kind: 'settlement', jurisdiction_code: '131148', account_name: '一般会計', axis: '科目', is_subject: true, parent_node_id: null, origin_id: 'o1', source_page: 1, amount_source_page: 2, kan_name: null, kou_name: null, node_id: '', fiscal_year: 0, ...over })
const KAN = [node({ node_id: id(1), node_kind: '款', name: '子ども教育費', amount_yen: 600, fiscal_year: 2025 }), node({ node_id: id(2), node_kind: '款', name: '総務費', amount_yen: 400, fiscal_year: 2025 }), node({ node_id: id(3), node_kind: '款', name: '子ども教育費', amount_yen: 500, fiscal_year: 2024 })]
const MOKU_2025 = [
  node({ node_id: id(10), node_kind: '目', name: '積立金', amount_yen: 900, fiscal_year: 2025, kan_name: '諸支出金', kou_name: '積立金' }),
  node({ node_id: id(11), parent_node_id: id(20), node_kind: '目', name: '保育園費', amount_yen: 300, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費' }),
]
const MOKU_2024 = [node({ node_id: id(12), node_kind: '目', name: '保育園費', amount_yen: 200, fiscal_year: 2024, kan_name: '子ども教育費', kou_name: '子ども費' })]
const CHILDREN: Record<string, Record<string, Row[]>> = {
  [id(1)]: { 科目: [node({ node_id: id(20), parent_node_id: id(1), node_kind: '項', name: '子ども費', amount_yen: 600, fiscal_year: 2025 })] },
  [id(2)]: { 科目: [node({ node_id: id(21), parent_node_id: id(2), node_kind: '項', name: '総務管理費', amount_yen: 400, fiscal_year: 2025 })] },
  [id(20)]: { 科目: [node({ node_id: id(11), parent_node_id: id(20), node_kind: '目', name: '保育園費', amount_yen: 300, fiscal_year: 2025 })] },
  [id(11)]: { 節: [node({ node_id: id(30), parent_node_id: id(11), axis: '節', is_subject: false, node_kind: '節', name: '扶助費', amount_yen: 250, fiscal_year: 2025 }), node({ node_id: id(31), parent_node_id: id(11), axis: '節', is_subject: false, node_kind: '節', name: '委託料', amount_yen: 50, fiscal_year: 2025 })] },
}

function fixtureApi({ axis = '科目', code = '131148', name = '中野区', extraNodes = [] as Row[] } = {}) {
  const map = (n: Row): Row => ({ ...n, jurisdiction_code: code, axis: n.is_subject ? axis : n.axis })
  const rows = [...new Map([...Object.values(CHILDREN).flatMap((axes) => Object.values(axes).flat()), ...KAN, ...MOKU_2025, ...MOKU_2024, ...extraNodes].map((n) => [n.node_id, map(n)])).values()]
  return { fetch: async (req: Request) => {
    const url = new URL(req.url)
    if (url.pathname === '/v1/jurisdictions')
      return Response.json({ jurisdictions: [
        { jurisdiction_code: code, name, prefecture_name: '東京都', coverage: [2024, 2025].map((fiscal_year) => ({ fiscal_year, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] })) },
        { jurisdiction_code: '131016', name: '千代田区', prefecture_name: '東京都', coverage: [] },
      ] })
    if (url.pathname === '/v1/expenditure/nodes:search') {
      const parsed = searchInput.safeParse(await req.json())
      if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 })
      const body = parsed.data
      const matches = rows.filter((n) => n.fiscal_year >= body.fiscal_year.min && n.fiscal_year <= body.fiscal_year.max && Object.entries(body.where ?? {}).every(([key, cond]) => {
        const eq = (cond as { eq?: unknown } | undefined)?.eq
        return eq === undefined || (Array.isArray(eq) ? eq.includes(n[key]) : eq === n[key])
      })).sort((a, b) => Number(b.amount_yen ?? 0) - Number(a.amount_yen ?? 0))
      const offset = Number(body.page_token?.slice(8) ?? 0)
      return Response.json({ nodes: matches.slice(offset, offset + body.page_size), next_page_token: offset + body.page_size < matches.length ? `fixture_${offset + body.page_size}` : null, origins: [{ origin_id: 'o1', title: '令和7年度決算書' }] })
    }
    const m = url.pathname.match(/^\/v1\/expenditure\/nodes\/settlement\/([0-9a-f]{64})$/)
    if (m) {
      const self = rows.find((n) => n.node_id === m[1])
      const children: Record<string, Row[]> = {}
      for (const child of rows.filter((n) => n.parent_node_id === m[1])) (children[String(child.axis)] ??= []).push(child)
      return Response.json({ node: self, children, next_page_token: null })
    }
    return new Response('nf', { status: 404 })
  } }
}
const API = fixtureApi()
const env: Env = { API, VIEW_RATE_LIMIT: { limit: async () => ({ success: true }) } }
const get = (path: string, e: Env = env) => web.fetch(new Request(`https://fudoki.dev${path}`), e)

describe('自治体の個別ページ', () => {
  test('款の和・事業・前年度の同じ目から組み、HTML に金額と自治体名を入れる', async () => {
    const res = await get(`/${encodeURIComponent('東京都')}/${encodeURIComponent('中野区')}`, { ...env, TURNSTILE_SITE_KEY: 'public-test-key' })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<title>中野区の歳出｜令和7年度決算｜風土記</title>')
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
    expect(html).toContain('<link rel="canonical" href="https://fudoki.dev/%E6%9D%B1%E4%BA%AC%E9%83%BD/%E4%B8%AD%E9%87%8E%E5%8C%BA">')
    // 年度ごとの総額は、その年度の款（兄弟）の和
    const data = JSON.parse(html.match(/<script type="application\/json" id="j-data">(.*?)<\/script>/s)![1]!)
    expect(data.years.map((y: { year: number; yen: number }) => [y.year, y.yen])).toEqual([[2024, 500], [2025, 1000]])
    // 積立の款は事業の候補から外し、前年度の同じ目（款・項・名前が一致）だけを前年に使う
    expect(data.projects.map((p: { name: string; prevYen: number | null }) => [p.name, p.prevYen])).toEqual([['保育園費', 200]])
    expect(data.flow.map((d: { kan: { name: string }; kou: { name: string; moku: unknown[] }[] }) => [d.kan.name, d.kou.map((k) => k.name)])).toEqual([['子ども教育費', ['子ども費']], ['総務費', ['総務管理費']]])
    expect(data.flow[0].kou[0].moku).toEqual([])
  })

  test('収録の無い自治体は検索に出さず、名前が違えば 404、sitemap には収録のある自治体だけ', async () => {
    const empty = await get(`/${encodeURIComponent('東京都')}/${encodeURIComponent('千代田区')}`)
    expect(empty.status).toBe(200)
    expect(await empty.text()).toContain('<meta name="robots" content="noindex">')
    expect((await get(`/${encodeURIComponent('東京都')}/${encodeURIComponent('存在しない市')}`)).status).toBe(404)
    // 都道府県の形でなければ他の経路へ渡す（/s/:id などを奪わない）
    expect((await get(`/${encodeURIComponent('自治体')}`)).status).toBe(200)
    expect((await get('/s/not-a-session')).status).not.toBe(200)
    expect((await get('/api/none')).status).toBe(404)
    const sitemap = await (await get('/sitemap.xml')).text()
    expect(sitemap).toContain(`${encodeURIComponent('東京都')}/${encodeURIComponent('中野区')}`)
    expect(sitemap).not.toContain(encodeURIComponent('千代田区'))
  })

  test('収録年度が離れていても最新年度から5年間の決算を表示する', async () => {
    const sparse: Env = { API: { fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname === '/v1/jurisdictions')
        return Response.json({ jurisdictions: [{ jurisdiction_code: '131148', name: '中野区', prefecture_name: '東京都', coverage: [2019, 2020, 2021, 2023, 2025].map((fiscal_year) => ({ fiscal_year, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] })) }] })
      if (url.pathname === '/v1/expenditure/nodes:search') {
        const body = await req.json() as { fiscal_year: { min: number; max: number }; where: { node_kind: { eq: string[] } } }
        if (body.fiscal_year.max - body.fiscal_year.min > 4) return Response.json({ error: 'fiscal_year は 5 年以内にしてください' }, { status: 400 })
        const rows = body.where.node_kind.eq[0] === '款'
          ? [...KAN.filter((n) => n.fiscal_year === 2025), node({ node_id: id(4), node_kind: '款', name: '総務費', fiscal_year: 2021, amount_yen: 250 }), node({ node_id: id(5), node_kind: '款', name: '総務費', fiscal_year: 2023, amount_yen: 300 })]
          : MOKU_2025
        return Response.json({ nodes: rows.filter((n) => n.fiscal_year >= body.fiscal_year.min && n.fiscal_year <= body.fiscal_year.max) })
      }
      return API.fetch(req)
    } } }
    const res = await get('/東京都/中野区', sparse)
    expect(res.status).toBe(200)
    const html = await res.text()
    const data = JSON.parse(html.match(/<script type="application\/json" id="j-data">(.*?)<\/script>/s)![1]!)
    expect(data.years.map((y: YearTotal) => [y.year, y.yen])).toEqual([[2021, 250], [2023, 300], [2025, 1000]])
    expect(data.projects[0].prevYen).toBeNull()
  })

  test('API に繋がらないときは 502 で、sitemap は入口と一覧だけで答える', async () => {
    const down: Env = { API: { fetch: async () => new Response('x', { status: 500 }) } }
    expect((await get('/自治体', down)).status).toBe(502)
    const sitemap = await get('/sitemap.xml', down)
    expect(sitemap.status).toBe(200)
    expect(await sitemap.text()).toContain('https://fudoki.dev/%E8%87%AA%E6%B2%BB%E4%BD%93')
  })
})

describe('内訳の API', () => {
  test('後続ページの節を優先し、全ページの金額から上位の内訳を選ぶ', async () => {
    const paginated: Env = { ...env, API: { fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname !== `/v1/expenditure/nodes/settlement/${id(11)}`) return API.fetch(req)
      const token = url.searchParams.get('page_token')
      if (!token)
        return Response.json({ children: { 備考: Array.from({ length: 100 }, (_, i) => node({ node_id: id(100 + i), axis: '備考', name: `事業${i}`, amount_yen: 5000 })) }, next_page_token: 'next1' })
      if (token === 'next1')
        return Response.json({ children: { 節: [node({ name: '委託料', amount_yen: 1000 }), node({ name: '扶助費', amount_yen: 2000 })] }, next_page_token: 'next2' })
      if (token === 'next2')
        return Response.json({ children: { 節: [node({ name: '負担金補助及び交付金', amount_yen: 3000 }), node({ name: '旅費', amount_yen: 500 })] }, next_page_token: null })
      return new Response('invalid page token', { status: 400 })
    } } }
    const res = await get(`/api/jurisdictions/setsu/${id(11)}`, paginated)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { name: '負担金補助及び交付金', yen: 3000 },
      { name: '扶助費', yen: 2000 },
      { name: '委託料', yen: 1000 },
    ])
  })

  test('id の形が違えば 400、流量の binding が無ければ 503、正しければ内訳を返す', async () => {
    expect((await get('/api/jurisdictions/drill/not-an-id')).status).toBe(400)
    expect((await get(`/api/jurisdictions/setsu/${id(11)}`, { API })).status).toBe(503)
    const ok = await get(`/api/jurisdictions/setsu/${id(11)}`)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual([{ name: '扶助費', yen: 250 }, { name: '委託料', yen: 50 }])
  })
  test('款でない node の流れは返さない', async () => {
    expect((await get(`/api/jurisdictions/drill/${id(11)}`)).status).toBe(502)
  })
})
