import { describe, expect, test } from 'bun:test'
import { changePct, formatYen, reiwa } from '../jurisdiction/types'
import web from '../worker'
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
})

const id = (n: number) => n.toString(16).padStart(64, '0')
type Row = Record<string, unknown> & { node_id: string; fiscal_year: number }
const node = (over: Record<string, unknown>): Row => ({ document_kind: 'settlement', jurisdiction_code: '131148', account_name: '一般会計', axis: '科目', origin_id: 'o1', source_page: 1, amount_source_page: 2, kan_name: null, kou_name: null, node_id: '', fiscal_year: 0, ...over })
const KAN = [node({ node_id: id(1), node_kind: '款', name: '子ども教育費', amount_yen: 600, fiscal_year: 2025 }), node({ node_id: id(2), node_kind: '款', name: '総務費', amount_yen: 400, fiscal_year: 2025 }), node({ node_id: id(3), node_kind: '款', name: '子ども教育費', amount_yen: 500, fiscal_year: 2024 })]
const MOKU_2025 = [
  node({ node_id: id(10), node_kind: '目', name: '積立金', amount_yen: 900, fiscal_year: 2025, kan_name: '諸支出金', kou_name: '積立金' }),
  node({ node_id: id(11), node_kind: '目', name: '保育園費', amount_yen: 300, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費' }),
]
const MOKU_2024 = [node({ node_id: id(12), node_kind: '目', name: '保育園費', amount_yen: 200, fiscal_year: 2024, kan_name: '子ども教育費', kou_name: '子ども費' })]
const CHILDREN: Record<string, Record<string, Row[]>> = {
  [id(1)]: { 科目: [node({ node_id: id(20), node_kind: '項', name: '子ども費', amount_yen: 600, fiscal_year: 2025 })] },
  [id(20)]: { 科目: [node({ node_id: id(11), node_kind: '目', name: '保育園費', amount_yen: 300, fiscal_year: 2025 })] },
  [id(11)]: { 節: [node({ node_id: id(30), node_kind: '節', name: '扶助費', amount_yen: 250, fiscal_year: 2025 }), node({ node_id: id(31), node_kind: '節', name: '委託料', amount_yen: 50, fiscal_year: 2025 })] },
}

const API = {
  fetch: async (req: Request) => {
    const url = new URL(req.url)
    if (url.pathname === '/v1/jurisdictions')
      return Response.json({
        jurisdictions: [
          { jurisdiction_code: '131148', name: '中野区', prefecture_name: '東京都', coverage: [{ fiscal_year: 2024, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] }, { fiscal_year: 2025, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] }] },
          { jurisdiction_code: '131016', name: '千代田区', prefecture_name: '東京都', coverage: [] },
        ],
      })
    if (url.pathname === '/v1/expenditure/nodes:search') {
      const body = (await req.json()) as { fiscal_year: { min: number; max: number }; where: { node_kind: { eq: string[] } } }
      const kind = body.where.node_kind.eq[0]
      const rows = kind === '款' ? KAN : [...MOKU_2025, ...MOKU_2024].filter((n) => n.fiscal_year >= body.fiscal_year.min && n.fiscal_year <= body.fiscal_year.max)
      return Response.json({ nodes: rows.filter((n) => n.fiscal_year >= body.fiscal_year.min && n.fiscal_year <= body.fiscal_year.max), origins: [{ origin_id: 'o1', title: '令和7年度決算書' }] })
    }
    const m = url.pathname.match(/^\/v1\/expenditure\/nodes\/settlement\/([0-9a-f]{64})$/)
    if (m) {
      const nodeId = m[1]!
      const self = [...KAN, ...MOKU_2025].find((n) => n.node_id === nodeId) ?? CHILDREN[nodeId]?.['科目']?.[0]
      return Response.json({ node: self, children: CHILDREN[nodeId] ?? {} })
    }
    return new Response('nf', { status: 404 })
  },
}
const env: Env = { API, VIEW_RATE_LIMIT: { limit: async () => ({ success: true }) } }
const get = (path: string, e: Env = env) => web.fetch(new Request(`https://fudoki.dev${path}`), e)

describe('自治体の個別ページ', () => {
  test('款の和・事業・前年度の同じ目から組み、HTML に金額と自治体名を入れる', async () => {
    const res = await get(`/${encodeURIComponent('東京都')}/${encodeURIComponent('中野区')}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<title>中野区の歳出｜令和7年度決算｜風土記</title>')
    expect(html).toContain('<link rel="canonical" href="https://fudoki.dev/%E6%9D%B1%E4%BA%AC%E9%83%BD/%E4%B8%AD%E9%87%8E%E5%8C%BA">')
    // 年度ごとの総額は、その年度の款（兄弟）の和
    const data = JSON.parse(html.match(/<script type="application\/json" id="j-data">(.*?)<\/script>/s)![1]!)
    expect(data.years.map((y: { year: number; yen: number }) => [y.year, y.yen])).toEqual([[2024, 500], [2025, 1000]])
    // 積立の款は事業の候補から外し、前年度の同じ目（款・項・名前が一致）だけを前年に使う
    expect(data.projects.map((p: { name: string; prevYen: number | null }) => [p.name, p.prevYen])).toEqual([['保育園費', 200]])
    expect(data.flow.kou[0].moku[0].setsu.map((s: { name: string }) => s.name)).toEqual(['扶助費', '委託料'])
  })

  test('収録の無い自治体は検索に出さず、名前が違えば 404、sitemap には収録のある自治体だけ', async () => {
    const empty = await get(`/${encodeURIComponent('東京都')}/${encodeURIComponent('千代田区')}`)
    expect(empty.status).toBe(200)
    expect(await empty.text()).toContain('<meta name="robots" content="noindex">')
    expect((await get(`/${encodeURIComponent('東京都')}/${encodeURIComponent('存在しない市')}`)).status).toBe(404)
    // 都道府県の形でなければ他の経路へ渡す（/s/:id などを奪わない）
    expect((await get('/s/not-a-session')).status).not.toBe(200)
    expect((await get('/api/none')).status).toBe(404)
    const sitemap = await (await get('/sitemap.xml')).text()
    expect(sitemap).toContain(`${encodeURIComponent('東京都')}/${encodeURIComponent('中野区')}`)
    expect(sitemap).not.toContain(encodeURIComponent('千代田区'))
  })

  test('API に繋がらないときは 502 で、sitemap は入口と一覧だけで答える', async () => {
    const down: Env = { API: { fetch: async () => new Response('x', { status: 500 }) } }
    expect((await get('/jurisdictions', down)).status).toBe(502)
    const sitemap = await get('/sitemap.xml', down)
    expect(sitemap.status).toBe(200)
    expect(await sitemap.text()).toContain('https://fudoki.dev/jurisdictions')
  })
})

describe('内訳の API', () => {
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
