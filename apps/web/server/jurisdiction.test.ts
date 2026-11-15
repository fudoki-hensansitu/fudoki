import { describe, expect, test } from 'bun:test'
import { changePct, formatYen, kanChanges, reiwa, type FlowDepth, type YearTotal } from '../jurisdiction/types'
import { fetchRoute } from './routes.testing'
import { emptyHead, pageHead, type Head } from '../jurisdiction/html'
import { homeEntries } from './jurisdiction-routes'
import { loadCofogFlow, loadFlow, loadFlowParts } from './jurisdiction'
import { cofogFlowOfDrills } from '../jurisdiction/cofog-flow'
import { jurisdictionProps, resolveJurisdiction } from '../pages/[prefecture]/_loader'
import type { Context } from 'hono'
import { DETAIL_TABLE, SUBJECT_TABLE } from '../../api/src/columns'
import { searchInputFor } from '../../api/src/shared/search'
import type { Env } from './env'
import { restRpc } from './fudoki-api'
import prefectures from '../../../packages/jurisdictions/prefectures.json'
import registry from '../../../packages/jurisdictions/jurisdictions.json'
import { TOPIC_SEGMENTS } from '../jurisdiction/path'
import { appYears } from './app-data'
import { withExtras, type Snapshot } from '../jurisdiction/app/data'

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

/** 試験の行（旧来の木の形）を、科目の表・内訳の表の行にする。内訳の親は科目（depth 1）、備考の欄は事業として返す */
const toSubject = ({ node_id, parent_node_id, node_kind, axis: _, is_subject: __, ...rest }: Row) => ({ ...rest, subject_id: node_id, parent_subject_id: parent_node_id, level: node_kind })
const toDetail = ({ node_id, parent_node_id, axis, is_subject: _, ...rest }: Row) => ({ ...rest, detail_id: node_id, parent_detail_id: null, subject_id: parent_node_id, breakdown: axis === '備考' ? '事業' : axis, depth: 1 })
const subjectSearch = searchInputFor(SUBJECT_TABLE)
const detailSearch = searchInputFor(DETAIL_TABLE)

function fixtureApi({ code = '131148', name = '中野区', extraNodes = [] as Row[] } = {}) {
  const rows = [...new Map([...Object.values(CHILDREN).flatMap((axes) => Object.values(axes).flat()), ...KAN, ...MOKU_2025, ...MOKU_2024, ...extraNodes].map((n): [string, Row] => [n.node_id, { ...n, jurisdiction_code: code }])).values()]
  const subjects = rows.filter((n) => n.is_subject).map(toSubject) as Record<string, unknown>[]
  const details = rows.filter((n) => !n.is_subject).map(toDetail) as Record<string, unknown>[]
  return { fetch: async (req: Request) => {
    const url = new URL(req.url)
    const jurisdictions = [
      { jurisdiction_code: code, name, prefecture_name: '東京都', population: [], evaluations: [], coverage: [2024, 2025].map((fiscal_year) => ({ fiscal_year, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] })) },
      { jurisdiction_code: '131016', name: '千代田区', prefecture_name: '東京都', population: [], evaluations: [], coverage: [] },
      { jurisdiction_code: '130001', name: '東京都', prefecture_name: '東京都', population: [], evaluations: [], coverage: [] },
    ]
    if (url.pathname === '/v1/jurisdictions') {
      // 公開 REST と同じ絞り込み（名前の部分一致・コード・資料区分の収録）だけを真似る
      const q = url.searchParams
      const hits = jurisdictions.filter((j) => (!q.get('name') || j.name.includes(q.get('name')!)) && (!q.get('code') || j.jurisdiction_code === q.get('code')) && (!q.get('document_kind') || j.coverage.some((c) => c.document_kind === q.get('document_kind'))))
      // page_size が1なら1件ずつ頁を送る（token は次の位置）
      const size = Number(q.get('page_size') ?? 100)
      const at = Number(q.get('page_token')?.replace('p', '') ?? 0)
      return Response.json({ jurisdictions: hits.slice(at, at + size), next_page_token: at + size < hits.length ? `p${at + size}` : null })
    }
    const one = url.pathname.match(/^\/v1\/jurisdictions\/(\d{6})$/)
    if (one) {
      const j = jurisdictions.find((x) => x.jurisdiction_code === one[1])
      return j ? Response.json(j) : Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
    }
    const kind = url.pathname === '/v1/expenditures/subjects:search' ? 'subjects' : url.pathname === '/v1/expenditures/details:search' ? 'details' : undefined
    if (kind) {
      const parsed = (kind === 'subjects' ? subjectSearch : detailSearch).safeParse(await req.json())
      if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 })
      const body = parsed.data
      const matches = (kind === 'subjects' ? subjects : details).filter((n) => Number(n.fiscal_year) >= body.fiscal_year.min && Number(n.fiscal_year) <= body.fiscal_year.max && Object.entries(body.where ?? {}).every(([key, cond]) => {
        const eq = (cond as { eq?: unknown } | undefined)?.eq
        return eq === undefined || (Array.isArray(eq) ? eq.includes(n[key]) : eq === n[key])
      })).sort((a, b) => Number(b.amount_yen ?? 0) - Number(a.amount_yen ?? 0))
      const offset = Number(body.page_token?.slice(8) ?? 0)
      return Response.json({ [kind]: matches.slice(offset, offset + body.page_size), next_page_token: offset + body.page_size < matches.length ? `fixture_${offset + body.page_size}` : null, origins: [{ origin_id: 'o1', title: '令和7年度決算書' }] })
    }
    const m = url.pathname.match(/^\/v1\/expenditures\/lines\/([0-9a-f]{64})$/)
    if (m) {
      const byBreakdown: Record<string, unknown[]> = {}
      for (const d of details.filter((d) => d.subject_id === m[1])) (byBreakdown[String(d.breakdown)] ??= []).push(d)
      return Response.json({ line: { kind: 'subject', ...subjects.find((n) => n.subject_id === m[1]) }, child_subjects: subjects.filter((n) => n.parent_subject_id === m[1]), details: byBreakdown, next_page_token: null })
    }
    return new Response('nf', { status: 404 })
  } }
}
const API = fixtureApi()
/** 試験の api（公開の REST と同じ形の偽物）を、内部の RPC の代わりの口（restRpc）で繋ぐ */
const web = (f: { fetch(req: Request): Promise<Response> }): Pick<Env, 'WEB'> => ({ WEB: restRpc((req) => f.fetch(req)) })
const env: Env = { ...web(API), VIEW_RATE_LIMIT: { limit: async () => ({ success: true }) } }
const get = (path: string, e: Env = env) => fetchRoute(new Request(`https://fudoki.dev${path}`), e)
const view = async (path: string, e: Env = env) => {
  const v = await resolveJurisdiction(e, path)
  if (v?.kind !== 'page') throw new Error(`${path} は個別ページにならなかった`)
  return v.data
}
const canonical = (h: Head) => h.link.find((l) => l.rel === 'canonical')?.href

describe('自治体の個別ページ', () => {
  test('API に繋がらないときは投げて（頁は 502）、sitemap は入口・アシスタントだけで答える', async () => {
    const down: Env = web({ fetch: async () => new Response('x', { status: 500 }) })
    await expect(resolveJurisdiction(down, '/tokyo/nakano')).rejects.toThrow()
    await expect(homeEntries(down)).rejects.toThrow()
    const sitemap = await get('/sitemap.xml', down)
    expect(sitemap.status).toBe(200)
    const xml = await sitemap.text()
    expect(xml).not.toContain('https://fudoki.dev/jurisdictions')
    expect(xml).toContain('https://fudoki.dev/assistant')
  })
})

describe('お金の流れ', () => {
  test('全款を返し、1000件を超える項と目・節を省略しない', async () => {
    const north: Env = { ...env, ...web(fixtureApi({ code: '131172', name: '北区', extraNodes: Array.from({ length: 1001 }, (_, i) => node({ node_id: id(1000 + i), parent_node_id: id(2), node_kind: '項', name: `追加項${i}`, amount_yen: 0, fiscal_year: 2025 })) })) }
    const flows = await loadFlow(north, '131172', 2025, 'setsu')
    expect(flows).toHaveLength(2)
    expect(flows.find((flow) => flow.kan.id === id(2))!.kou).toHaveLength(1002)
    expect(flows.find((flow) => flow.kan.id === id(1))!.kou[0]!.moku[0]!.setsu).toHaveLength(2)
  })

  test('印字のない項金額と印字された0円を区別して返す', async () => {
    const missing: Env = { ...env, ...web(fixtureApi({ code: '132012', name: '八王子市', extraNodes: [
      node({ node_id: id(20), parent_node_id: id(1), node_kind: '項', name: '子ども費', amount_yen: null, fiscal_year: 2025 }),
      node({ node_id: id(21), parent_node_id: id(2), node_kind: '項', name: '総務管理費', amount_yen: 0, fiscal_year: 2025 }),
    ] })) }
    for (const depth of ['kou', 'moku']) {
      const flows = await loadFlow(missing, '132012', 2025, depth as FlowDepth)
      expect(flows.find((flow) => flow.kan.id === id(1))!.kou[0]!.amountMissing).toBe(true)
      expect(flows.find((flow) => flow.kan.id === id(2))!.kou[0]!.amountMissing).toBeUndefined()
      expect(flows.find((flow) => flow.kan.id === id(2))!.kou[0]!.yen).toBe(0)
    }
  })
  test('機能分類の流れは COFOG の大分類・中分類で目を分け、印字のない目を含む分類に amountMissing を付ける', async () => {
    const cofog: Env = { ...env, ...web(fixtureApi({ code: '132012', name: '八王子市', extraNodes: [
      node({ node_id: id(30), parent_node_id: id(20), node_kind: '目', name: '児童手当費', amount_yen: null, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費', cofog_code: '10.4' }),
      node({ node_id: id(31), parent_node_id: id(20), node_kind: '目', name: '学校費', amount_yen: 50, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費', cofog_code: '09.1' }),
      node({ node_id: id(32), parent_node_id: id(20), node_kind: '目', name: '保育費', amount_yen: 70, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費', cofog_code: '10' }),
    ] })) }
    const flows = await loadCofogFlow(cofog, '132012', 2025, 'moku')
    // 予算・決算のタブは款 → 項 → 目の流れと、木に入らない目（試験の表の親の無い目）から画面で組み直す。サーバーで組んだものと同じになる
    const shape = (fs: typeof flows) => fs.map((f) => [f.kan, f.kou.map((k) => [k.name, k.yen, k.moku.map((m) => m.name)])])
    const parts = await loadFlowParts(cofog, '132012', 2025, 'moku')
    expect(parts.loose.length).toBeGreaterThan(0)
    expect(shape(cofogFlowOfDrills(parts.drills, parts.loose))).toEqual(shape(flows))
    // 款（子ども教育費）は使わず、COFOG の名前で分ける
    const social = flows.find((f) => f.kan.id === 'cofog-10')!
    expect(social.kan).toMatchObject({ name: '福祉・子育て', yen: 70, amountMissing: true })
    // 未分類は金額が大きくても最後
    expect(social.kou.map((k) => k.name)).toEqual(['家族及び児童', '未分類'])
    expect(social.kou[0]).toMatchObject({ yen: 0, amountMissing: true })
    expect(flows.find((f) => f.kan.id === 'cofog-09')!.kou[0]).toMatchObject({ name: '就学前教育及び初等教育', yen: 50, moku: [{ name: '学校費' }] })
    // COFOG の付かない目は「その他」に入り、最後に置く
    expect(flows.at(-1)!.kan.id).toBe('cofog-none')
    expect(flows.at(-1)!.kan.amountMissing).toBeUndefined()
  })
})

describe('自治体の検索（/api/jurisdictions）', () => {
  test('語に当たる自治体だけを返し、引数の形が違えば 400、流量の binding が無ければ 503', async () => {
    const hits = (await (await get('/api/jurisdictions?name=中野')).json()) as { entries: { name: string; path: string }[]; next: string | null }
    expect(hits.entries.map((h) => [h.name, h.path])).toEqual([['中野区', '/tokyo/nakano']])
    expect(hits.next).toBeNull()
    expect(await (await get('/api/jurisdictions?name=存在しない')).json()).toEqual({ entries: [], next: null })
    // 続きの印は api の page_token としてそのまま渡す（1件目より後には当たる自治体が無い）
    expect(await (await get('/api/jurisdictions?name=&cursor=p1')).json()).toEqual({ entries: [], next: null })
    // 続きの印は api の page_token の形だけを通す
    expect((await get('/api/jurisdictions?name=中野&cursor=a%2Fb')).status).toBe(400)
    expect((await get(`/api/jurisdictions?name=中野&cursor=${'a'.repeat(513)}`)).status).toBe(400)
    // うちのまちの名前はコードで引く。決算の収録の無い自治体は返さない
    expect(((await (await get('/api/jurisdictions?code=131148')).json()) as { name: string }[]).map((h) => h.name)).toEqual(['中野区'])
    expect(await (await get('/api/jurisdictions?code=131016')).json()).toEqual([])
    expect((await get('/api/jurisdictions?code=nakano')).status).toBe(400)
    expect((await get(`/api/jurisdictions?name=${'あ'.repeat(51)}`)).status).toBe(400)
    // 前の応答（配列）を返していた ?q= は受けない（ブラウザに残った前の応答と URL を分ける）
    expect((await get('/api/jurisdictions?q=中野')).status).toBe(400)
    expect((await get('/api/jurisdictions?name=中野', web(API))).status).toBe(503)
  })
})

describe('事業の読み込み（/api/projects）', () => {
  const H = 'a'.repeat(64)
  const query = { code: '131148', year: 2025, kind: 'settlement', filter: 'all' }
  const post = (body: unknown, e: Env = env) => fetchRoute(new Request('https://fudoki.dev/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), e)
  test('内部の RPC で読み、引数の形が違えば 400、流量の binding が無ければ 503', async () => {
    const seen: unknown[] = []
    const WEB: Env['WEB'] = {
      call: async (name, input) => (seen.push([name, input]), { ok: true, value: { project_years: [], projects: [], total_size: 0, total_size_capped: false, next_page_token: null } as never }),
      mcp: async () => new Response('x'),
    }
    const ok = await post({ query }, { ...env, WEB })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ rows: [], total: 0, capped: false, next: null })
    expect(seen.map((s) => (s as [string])[0])).toEqual(['search_projects'])
    expect((await post({ query: { ...query, code: 'nakano' } })).status).toBe(400)
    expect((await post({ query: { ...query, subjects: ['x'] } })).status).toBe(400)
    expect((await post({ query, token: 'a'.repeat(513) })).status).toBe(400)
    expect((await get(`/api/projects/${H}?year=2025&kind=other`)).status).toBe(400)
    expect((await get('/api/projects/xyz?year=2025&kind=settlement')).status).toBe(400)
    expect((await get(`/api/projects?detail=${H}&year=20255&kind=initial`)).status).toBe(400)
    expect((await post({ query }, web(API))).status).toBe(503)
  })
  test('評価シートの一覧・区分ごとの数（/api/sheets）は内部の RPC で読み、引数の形が違えば 400', async () => {
    const seen: [string, unknown][] = []
    const WEB: Env['WEB'] = {
      call: async (name, input) => (seen.push([name, input]), { ok: true, value: (name === 'count_evaluation_sheets' ? { counts: [{ outlook: null, size: 2 }] } : { sheets: [], origins: [], total_size: 0, total_size_capped: false, next_page_token: null }) as never }),
      mcp: async () => new Response('x'),
    }
    const sheets = (path: string, body: unknown, e: Env = env) => fetchRoute(new Request(`https://fudoki.dev${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), e)
    const q = { code: '131148', year: 2025, kind: 'initial', codes: ['keep'] }
    expect(await (await sheets('/api/sheets', { query: q }, { ...env, WEB })).json()).toEqual({ rows: [], next: null })
    expect(await (await sheets('/api/sheets/counts', { query: q }, { ...env, WEB })).json()).toEqual([{ code: null, label: null, grade: null, n: 2 }])
    // 数えるときは区分で絞らない
    expect(seen.map(([n, i]) => [n, (i as { where: Record<string, unknown> }).where.direction_code])).toEqual([['search_evaluation_sheets', { eq: ['keep'] }], ['count_evaluation_sheets', undefined]])
    // 分野の科目は、頁が見せている資料の目で絞る
    seen.length = 0
    await sheets('/api/sheets', { query: { ...q, subjects: [H] } }, { ...env, WEB })
    expect(Object.keys((seen[0]![1] as { where: Record<string, unknown> }).where)).toContain('initial_expenditure_subject_id')
    expect((await sheets('/api/sheets', { query: { ...q, kind: 'other' } })).status).toBe(400)
    expect((await sheets('/api/sheets', { query: { ...q, codes: ['x'] } })).status).toBe(400)
    expect((await sheets('/api/sheets', { query: { ...q, code: 'nakano' } })).status).toBe(400)
    expect((await sheets('/api/sheets/counts', { query: { ...q, subjects: ['x'] } })).status).toBe(400)
  })
  test('うちのまちの札（/api/jurisdictions/:code）は形が違えば 400、未収録・頁に無い年度は 404、API に繋がらなければ 502', async () => {
    expect((await get('/api/jurisdictions/nakano?year=2025')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148?year=25')).status).toBe(400)
    expect((await get('/api/jurisdictions/131016')).status).toBe(404)
    expect((await get('/api/jurisdictions/131148?year=1999')).status).toBe(404)
    expect((await get('/api/jurisdictions/131148?year=2025', { ...env, ...web({ fetch: async () => new Response('x', { status: 500 }) }) })).status).toBe(502)
  })
})

describe('最初の画面に要らない分', () => {
  test('前の年度の分野の科目（/api/jurisdictions/:code/:year/field-subjects）は形・資料の種類が違えば 400、流量の binding が無ければ 503', async () => {
    expect((await get('/api/jurisdictions/nakano/2025/field-subjects?kind=initial')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/25/field-subjects?kind=initial')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/2025/field-subjects')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/2025/field-subjects?kind=other')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/2025/field-subjects?kind=initial', web(API))).status).toBe(503)
  })
})
