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

describe('金額と年度の表記', () => {
  test('1億円以上は億円、未満は万円。100億円以上は小数を出さない', () => {
    expect(formatYen(58_443_843_520)).toBe('584億円')
    expect(formatYen(9_147_986_681)).toBe('91.5億円')
    expect(formatYen(355_826_620)).toBe('3.6億円')
    expect(formatYen(76_543_210)).toBe('7,654万円')
  })
  test('西暦を令和の R 表記にする', () => {
    expect(reiwa(2025)).toBe('R7年度')
    expect(reiwa(2019)).toBe('R1年度')
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
      kan: Object.entries(amounts).map(([name, yen]) => ({ id: name, name, yen })),
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
    if (url.pathname === '/v1/jurisdictions') return Response.json({ jurisdictions })
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
  test('当初予算と決算の両方がある年度は決算を読み、決算より後の年度だけ当初予算を読む', () => {
    expect(appYears({ initialYears: [2024, 2025, 2026], settlementYears: [2024] })).toEqual([
      { year: 2026, kind: 'initial' },
      { year: 2025, kind: 'initial' },
      { year: 2024, kind: 'settlement' },
    ])
  })
  test('head に最新の決算・当初予算の金額と自治体名を入れる', async () => {
    const base = await view('/tokyo/nakano')
    // 金額（headline）は loader が本文と同じ段で足す
    const data = { ...base, headline: { settlement: { year: 2025, yen: 1000, areas: [{ name: '教育', yen: 600, other: false }, { name: 'その他', yen: 400, other: true }] } } }
    const head = pageHead(data)
    expect(head.title).toBe('中野区の決算（令和7年度）｜風土記')
    // 決算より後の当初予算があれば、title に予算と決算を、説明文に両方の金額を年度つきで入れる
    const withBudget = { ...data, budgetYears: [2026], headline: { ...data.headline, budget: { year: 2026, yen: 1_234_000_000 } } }
    expect(pageHead(withBudget).title).toBe('中野区の予算と決算（令和8年度）｜風土記')
    expect(pageHead(withBudget).meta.find((m) => m.name === 'description')?.content).toMatch(/^中野区の令和8年度当初予算の歳出は約12\.3億円、令和7年度決算（一般会計）の歳出は約/)
    // 金額の無い当初予算（headline に無い）は title に使わない
    expect(pageHead({ ...data, budgetYears: [2026] }).title).toBe(head.title)
    expect(canonical(head)).toBe('https://fudoki.dev/tokyo/nakano')
    // 紋章と決算のある自治体は og:image を自治体の画像に差し替え、紋章の無い自治体は全頁共通の画像のまま
    expect(head.meta).toContainEqual({ property: 'og:image', content: 'https://fudoki.dev/jurisdictions/131148/og.png' })
    expect(pageHead({ ...data, emblem: null }).meta.some((m) => m.property === 'og:image')).toBe(false)
    // 画像の金額は最新の決算なので、過去の年度の頁・決算の分野が無い頁は全頁共通の画像のまま
    expect(pageHead(data, 2024).meta.some((m) => m.property === 'og:image')).toBe(false)
    expect(pageHead({ ...data, headline: { settlement: { ...data.headline.settlement, areas: [] } } }).meta.some((m) => m.property === 'og:image')).toBe(false)
    const ld = JSON.parse(head.script![0]!.innerHTML!) as { '@type': string; itemListElement?: { position: number; name: string; item: string }[] }[]
    expect(ld.find((x) => x['@type'] === 'BreadcrumbList')?.itemListElement?.map((x) => [x.position, x.name, x.item])).toEqual([
      [1, '風土記', 'https://fudoki.dev/'],
      [2, '東京都', 'https://fudoki.dev/tokyo'],
      [3, '中野区', 'https://fudoki.dev/tokyo/nakano'],
    ])
    // 頁のデータは API を読まずにカタログの1件から決まる（金額は持たない）
    expect(base.settlementYears).toEqual([2024, 2025])
    const flow = await loadFlow(env, '131148', 2025)
    expect(flow.map((d) => [d.kan.name, d.kou.map((k) => k.name)])).toEqual([['子ども教育費', ['子ども費']], ['総務費', ['総務管理費']]])
    expect(flow[0]!.kou[0]!.moku).toEqual([])
  })

  test('収録の無い自治体は検索に出さず、名前が違えば 404、sitemap には収録のある自治体だけ', async () => {
    const empty = await resolveJurisdiction(env, '/tokyo/chiyoda')
    expect(empty?.kind).toBe('empty')
    if (empty?.kind === 'empty') expect(emptyHead(empty.entry).meta).toContainEqual({ name: 'robots', content: 'noindex' })
    expect(await resolveJurisdiction(env, '/tokyo/sonzaishinai')).toBeNull()
    // 都道府県自体は /tokyo（/tokyo/tokyo にしない）
    const tokyo = await resolveJurisdiction(env, '/tokyo')
    expect(tokyo?.kind === 'empty' && canonical(emptyHead(tokyo.entry))).toBe('https://fudoki.dev/tokyo')
    expect(await resolveJurisdiction(env, '/tokyo/tokyo')).toBeNull()
    // 都道府県の slug でなければ自治体のページにしない（/s/:id などを奪わない）
    expect(await resolveJurisdiction(env, '/jurisdictions')).toBeNull()
    expect(await resolveJurisdiction(env, '/s/not-a-session')).toBeNull()
    expect((await get('/api/none')).status).toBe(404)
    const sitemap = await (await get('/sitemap.xml')).text()
    expect(sitemap).toContain('<loc>https://fudoki.dev/tokyo/nakano</loc>')
    expect(sitemap).not.toContain('chiyoda')
    // 過去の年度の頁は載せ、最新の年度の頁は canonical が入口なので載せない（タブの頁は載せる）
    expect(sitemap).toContain('<loc>https://fudoki.dev/tokyo/nakano/2024</loc>')
    expect(sitemap).not.toContain('<loc>https://fudoki.dev/tokyo/nakano/2025</loc>')
    expect(sitemap).toContain('<loc>https://fudoki.dev/tokyo/nakano/2025/projects</loc>')
  })

  test('年度の頁は、その年度の title と canonical を持ち、最新の年度は 200 で canonical を入口にし、選べない年度は 404', async () => {
    const data = await view('/tokyo/nakano')
    // 年度の頁の金額は、本文が読んだその年度の款項目（opened）から書く
    const head = pageHead(data, 2024, undefined, { year: 2024, kind: 'settlement', yen: 500, originTitle: null })
    expect(head.title).toBe('中野区の決算（令和6年度）｜風土記')
    expect(canonical(head)).toBe('https://fudoki.dev/tokyo/nakano/2024')
    expect(head.meta.find((m) => m.name === 'description')?.content).toStartWith('中野区の令和6年度決算（一般会計）の歳出は約')
    const headers = new Headers()
    const c = { env, req: { url: 'https://fudoki.dev/tokyo/nakano/2024' }, header: (k: string, v: string) => headers.set(k, v) } as unknown as Context
    expect((await jurisdictionProps(c, '/tokyo/nakano', '2024')).year).toBe(2024)
    // 戻る遷移で取り直さないようブラウザに置く
    expect(headers.get('Cache-Control')).toBe('public, max-age=300')
    const status = (segment: string) => jurisdictionProps(c, '/tokyo/nakano', segment).then(() => 200, (e: { status: number; res?: Response }) => [e.status, e.res?.headers.get('Location') ?? null])
    expect(await status('2025')).toBe(200)
    expect(canonical(pageHead(data, 2025))).toBe('https://fudoki.dev/tokyo/nakano')
    expect(canonical(pageHead(data, 2025, { tab: 'projects' }))).toBe('https://fudoki.dev/tokyo/nakano/2025/projects')
    expect(await status('2019')).toEqual([404, null])
  })

  test('ホームの自治体の要約は決算を収録している自治体だけを載せる', async () => {
    expect((await homeEntries(env)).map((e) => [e.name, e.path, e.latestYear])).toEqual([['中野区', '/tokyo/nakano', 2025]])
  })


  test('URL のローマ字は自治体マスタの全自治体にあり、同じ都道府県の中でもテーマの段とも重ならない', () => {
    const seen = new Set<string>()
    for (const [code, j] of Object.entries(registry.jurisdictions as Record<string, { name: string; slug?: string }>)) {
      expect(j.slug, `${code} ${j.name}`).toMatch(/^[a-z]+(-[a-z]+)*$/)
      const key = `${code.slice(0, 2)}/${j.slug}`
      expect(seen.has(key), `${code} ${j.name} の slug が重なる`).toBe(false)
      expect(TOPIC_SEGMENTS.has(j.slug!), `${code} ${j.name} の slug がテーマの段と重なる`).toBe(false)
      seen.add(key)
    }
    expect(Object.keys(prefectures.slugs)).toHaveLength(47)
    expect(new Set(Object.values(prefectures.slugs)).size).toBe(47)
  })

  test('収録年度が離れていても最新年度から5年間の決算を表示する', async () => {
    const sparse: Env = web({ fetch: async (req) => {
      const url = new URL(req.url)
      const nakano = { jurisdiction_code: '131148', name: '中野区', prefecture_name: '東京都', population: [], evaluations: [], coverage: [2019, 2020, 2021, 2023, 2025].map((fiscal_year) => ({ fiscal_year, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] })) }
      if (url.pathname === '/v1/jurisdictions') return Response.json({ jurisdictions: [nakano] })
      if (url.pathname === '/v1/jurisdictions/131148') return Response.json(nakano)
      if (url.pathname === '/v1/expenditures/subjects:search') {
        const body = await req.json() as { fiscal_year: { min: number; max: number }; where: { level: { eq: string[] } } }
        if (body.fiscal_year.max - body.fiscal_year.min > 4) return Response.json({ error: 'fiscal_year は 5 年以内にしてください' }, { status: 400 })
        const rows = body.where.level.eq[0] === '款'
          ? [...KAN.filter((n) => n.fiscal_year === 2025), node({ node_id: id(4), node_kind: '款', name: '総務費', fiscal_year: 2021, amount_yen: 250 }), node({ node_id: id(5), node_kind: '款', name: '総務費', fiscal_year: 2023, amount_yen: 300 })]
          : MOKU_2025
        return Response.json({ subjects: rows.filter((n) => n.fiscal_year >= body.fiscal_year.min && n.fiscal_year <= body.fiscal_year.max).map(toSubject) })
      }
      return API.fetch(req)
    } })
    const data = await view('/tokyo/nakano', sparse)
    expect(data.settlementYears).toEqual([2021, 2023, 2025])
    const xml = await (await get('/sitemap.xml', sparse)).text()
    expect(xml).toContain('https://fudoki.dev/tokyo/nakano/2023')
    expect(xml).toContain('https://fudoki.dev/tokyo/nakano/2021')
    expect(xml).not.toContain('https://fudoki.dev/tokyo/nakano/2020')
    expect(xml).not.toContain('https://fudoki.dev/tokyo/nakano/2019')
  })

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
    const hits = (await (await get('/api/jurisdictions?q=中野')).json()) as { name: string; path: string }[]
    expect(hits.map((h) => [h.name, h.path])).toEqual([['中野区', '/tokyo/nakano']])
    expect(await (await get('/api/jurisdictions?q=存在しない')).json()).toEqual([])
    // うちのまちの名前はコードで引く。決算の収録の無い自治体は返さない
    expect(((await (await get('/api/jurisdictions?code=131148')).json()) as { name: string }[]).map((h) => h.name)).toEqual(['中野区'])
    expect(await (await get('/api/jurisdictions?code=131016')).json()).toEqual([])
    expect((await get('/api/jurisdictions?code=nakano')).status).toBe(400)
    expect((await get(`/api/jurisdictions?q=${'あ'.repeat(51)}`)).status).toBe(400)
    expect((await get('/api/jurisdictions?q=中野', web(API))).status).toBe(503)
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
  test('うちのまちの札（/api/jurisdictions/:code）は形が違えば 400、未収録・頁に無い年度は 404、API に繋がらなければ 502', async () => {
    expect((await get('/api/jurisdictions/nakano?year=2025')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148?year=25')).status).toBe(400)
    expect((await get('/api/jurisdictions/131016')).status).toBe(404)
    expect((await get('/api/jurisdictions/131148?year=1999')).status).toBe(404)
    expect((await get('/api/jurisdictions/131148?year=2025', { ...env, ...web({ fetch: async () => new Response('x', { status: 500 }) }) })).status).toBe(502)
  })
})

describe('最初の画面に要らない分（/api/jurisdictions/:code/:year/extras）', () => {
  test('形が違えば 400、未収録・頁に無い年度・会計は 404、流量の binding が無ければ 503', async () => {
    expect((await get('/api/jurisdictions/nakano/2025/extras')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/25/extras')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/2025/setsu/other')).status).toBe(400)
    expect((await get('/api/jurisdictions/131148/2025/setsu/settlement/%E0%A4%A')).status).toBe(400)
    expect((await get('/api/jurisdictions/131016/2025/extras')).status).toBe(404)
    expect((await get('/api/jurisdictions/131148/2019/field-subjects')).status).toBe(404)
    expect((await get(`/api/jurisdictions/131148/2025/setsu/settlement/${encodeURIComponent('特別会計')}`)).status).toBe(404)
    expect((await get('/api/jurisdictions/131148/2025/extras', web(API))).status).toBe(503)
  })
  test('施策・評価シートの分野は、開いた年度の款項目から科目の ID、無ければ款・項・目の名前で引く', () => {
    const base: Snapshot = {
      code: '131148', name: '中野区', pop: 0, year: 2025, kinds: { 2025: 'settlement' }, measures: [], sheets: [], lists: {}, pending: true,
      years: { 2025: { kind: 'settlement', total: 300, fields: { welfare: 300 }, fieldSubjects: { welfare: [id(11)] }, looseMoku: [], origin: null, originTitle: null, kan: [{ name: '子ども教育費', yen: 300, kou: [{ name: '子ども費', yen: 300, moku: [{ id: id(11), name: '保育園費', yen: 300, field: 'welfare', cofog: null }] }] }] } },
    }
    const m = { id: 'm', fy: 2025, title: '', new: true, yen: 1, desc: [], detail: null, url: '', origin: 'o', page: 1 }
    const s = { id: 's', fy: 2025, name: '', grade: null, dir: null, dc: null, dl: null, div: null, acct: '', b: null, s: null, detail: null, url: '', origin: 'o', page: 1 }
    const d = withExtras(base, {
      measures: [{ ...m, subject: id(11), path: null }, { ...m, subject: id(99), path: ['子ども教育費', '子ども費', '保育園費'] }, { ...m, subject: null, path: null }],
      sheets: [{ ...s, path: ['子ども教育費', '子ども費', '保育園費'] }, { ...s, path: ['総務費', '総務管理費', '一般管理費'] }],
      hasProjects: true,
      lists: {},
    })
    expect(d.measures.map((x) => x.field)).toEqual(['welfare', 'welfare', 'other'])
    expect(d.sheets.map((x) => x.field)).toEqual(['welfare', 'other'])
    expect(d.pending).toBeUndefined()
    expect(d.hasProjects).toBe(true)
  })
})
