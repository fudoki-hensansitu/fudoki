import { describe, expect, test } from 'bun:test'
import { changePct, formatYen, kanChanges, reiwa, type YearTotal } from '../jurisdiction/types'
import { fetchRoute } from './routes.testing'
import { emptyHead, indexHead, pageHead, type Head } from '../jurisdiction/html'
import { indexPageData, resolveJurisdiction } from './jurisdiction-routes'
import { jurisdictionProps } from './pages'
import type { Context } from 'hono'
import { DEFAULT_INDEX_QUERY, queryIndex } from '../jurisdiction/index-table'
import type { IndexEntry } from '../jurisdiction/types'
import { DETAIL_TABLE, SUBJECT_TABLE } from '../../api/src/columns'
import { searchInputFor } from '../../api/src/search'
import type { Env } from './env'
import prefectures from '../../../packages/jurisdictions/prefectures.json'
import registry from '../../../packages/jurisdictions/jurisdictions.json'
import { TOPIC_SEGMENTS } from '../jurisdiction/path'

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
    if (url.pathname === '/v1/jurisdictions')
      return Response.json({ jurisdictions: [
        { jurisdiction_code: code, name, prefecture_name: '東京都', coverage: [2024, 2025].map((fiscal_year) => ({ fiscal_year, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] })) },
        { jurisdiction_code: '131016', name: '千代田区', prefecture_name: '東京都', coverage: [] },
        { jurisdiction_code: '130001', name: '東京都', prefecture_name: '東京都', coverage: [] },
      ] })
    const kind = url.pathname === '/v1/fiscal/expenditure/subjects:search' ? 'subjects' : url.pathname === '/v1/fiscal/expenditure/details:search' ? 'details' : undefined
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
    const m = url.pathname.match(/^\/v1\/fiscal\/expenditure\/subjects\/([0-9a-f]{64})$/)
    if (m) {
      const byBreakdown: Record<string, unknown[]> = {}
      for (const d of details.filter((d) => d.subject_id === m[1])) (byBreakdown[String(d.breakdown)] ??= []).push(d)
      return Response.json({ subject: subjects.find((n) => n.subject_id === m[1]), children: subjects.filter((n) => n.parent_subject_id === m[1]), details: byBreakdown, next_page_token: null })
    }
    return new Response('nf', { status: 404 })
  } }
}
const API = fixtureApi()
const env: Env = { API, VIEW_RATE_LIMIT: { limit: async () => ({ success: true }) } }
const get = (path: string, e: Env = env) => fetchRoute(new Request(`https://fudoki.dev${path}`), e)
const view = async (path: string, e: Env = env) => {
  const v = await resolveJurisdiction(e, path)
  if (v?.kind !== 'page') throw new Error(`${path} は個別ページにならなかった`)
  return v.data
}
const canonical = (h: Head) => h.link.find((l) => l.rel === 'canonical')?.href

describe('自治体の個別ページ', () => {
  test('款の和・事業・前年度の同じ目から組み、head に金額と自治体名を入れる', async () => {
    const data = await view('/tokyo/nakano')
    const head = pageHead(data)
    expect(head.title).toBe('中野区の決算（令和7年度）｜何にいくら使った？｜風土記')
    // 決算より後の当初予算があれば、title・説明文に予算と決算の両方を年度つきで入れる
    const budget = { year: 2026, yen: 1_234_000_000, kan: [], divisions: [], projects: [] }
    const withBudget = { ...data, budgets: [budget] }
    expect(pageHead(withBudget).title).toBe('中野区の予算と決算｜令和8年度予算・令和7年度決算｜風土記')
    expect(pageHead(withBudget).meta.find((m) => m.name === 'description')?.content).toMatch(/^中野区の令和8年度当初予算の歳出は約12\.3億円、令和7年度決算（一般会計）の歳出は約/)
    // 金額の無い当初予算は title に使わない
    expect(pageHead({ ...data, budgets: [{ ...budget, amountMissing: true as const }] }).title).toBe(head.title)
    expect(pageHead({ ...data, budgets: [{ ...budget, yen: 0 }] }).title).toBe(head.title)
    expect(canonical(head)).toBe('https://fudoki.dev/tokyo/nakano')
    // 紋章と決算のある自治体は og:image を自治体の画像に差し替え、紋章の無い自治体は全頁共通の画像のまま
    expect(head.meta).toContainEqual({ property: 'og:image', content: 'https://fudoki.dev/jurisdictions/131148/og.png' })
    expect(pageHead({ ...data, code: '999999' }).meta.some((m) => m.property === 'og:image')).toBe(false)
    // 画像の金額は最新の決算なので、過去の年度の頁・決算の分野が無い頁は全頁共通の画像のまま
    expect(pageHead(data, 2024).meta.some((m) => m.property === 'og:image')).toBe(false)
    expect(pageHead({ ...data, cofogFlow: [] }).meta.some((m) => m.property === 'og:image')).toBe(false)
    const ld = JSON.parse(head.script![0]!.innerHTML!) as { '@type': string; itemListElement?: { position: number; name: string; item: string }[] }[]
    expect(ld.find((x) => x['@type'] === 'BreadcrumbList')?.itemListElement?.map((x) => [x.position, x.name, x.item])).toEqual([
      [1, '風土記', 'https://fudoki.dev/'],
      [2, '東京都', 'https://fudoki.dev/tokyo'],
      [3, '中野区', 'https://fudoki.dev/tokyo/nakano'],
    ])
    // 年度ごとの総額は、その年度の款（兄弟）の和
    expect(data.years.map((y) => [y.year, y.yen])).toEqual([[2024, 500], [2025, 1000]])
    // 積立の款は事業の候補から外し、前年度の同じ目（款・項・名前が一致）だけを前年に使う
    expect(data.projects.map((p) => [p.name, p.prevYen])).toEqual([['保育園費', 200]])
    expect(data.flow.map((d) => [d.kan.name, d.kou.map((k) => k.name)])).toEqual([['子ども教育費', ['子ども費']], ['総務費', ['総務管理費']]])
    expect(data.flow[0]!.kou[0]!.moku).toEqual([])
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
    // 既定でない年度の頁も載せ、既定の年度（最新）は自治体の頁だけにする
    expect(sitemap).toContain('<loc>https://fudoki.dev/tokyo/nakano/2024</loc>')
    expect(sitemap).not.toContain('/tokyo/nakano/2025')
  })

  test('年度の頁は、その年度の title と canonical を持ち、既定の年度は自治体の頁へ 301、選べない年度は 404', async () => {
    const data = await view('/tokyo/nakano')
    const head = pageHead(data, 2024)
    expect(head.title).toBe('中野区の決算（令和6年度）｜何にいくら使った？｜風土記')
    expect(canonical(head)).toBe('https://fudoki.dev/tokyo/nakano/2024')
    expect(head.meta.find((m) => m.name === 'description')?.content).toStartWith('中野区の令和6年度決算（一般会計）の歳出は約')
    const c = { env, req: { url: 'https://fudoki.dev/tokyo/nakano/2024' } } as unknown as Context
    expect((await jurisdictionProps(c, '/tokyo/nakano', '2024')).year).toBe(2024)
    const status = (segment: string) => jurisdictionProps(c, '/tokyo/nakano', segment).then(() => 200, (e: { status: number; res?: Response }) => [e.status, e.res?.headers.get('Location') ?? null])
    expect(await status('2025')).toEqual([301, '/tokyo/nakano'])
    expect(await status('2019')).toEqual([404, null])
  })

  test('一覧は収録のある自治体だけを、最新の決算の款の和で載せる', async () => {
    const { map, table } = await indexPageData(env)
    expect(table.rows.map((e) => [e.name, e.year, e.yen, e.path])).toEqual([['中野区', 2025, 1000, '/tokyo/nakano']])
    expect(map.map((e) => e.code)).toEqual(table.rows.map((e) => e.code))
    expect(canonical(indexHead(map.length))).toBe('https://fudoki.dev/jurisdictions')
  })

  test('一覧の総額は金額の印字が無い款を 0 と数えず、一部の款の和だと印を付ける', async () => {
    const api = fixtureApi({ extraNodes: [node({ node_id: id(99), node_kind: '款', name: '予備費', amount_yen: null, fiscal_year: 2025 })] })
    const { table } = await indexPageData({ ...env, API: api })
    expect(table.rows.map((e) => [e.yen, e.amountMissing])).toEqual([[1000, true]])
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
    const sparse: Env = { API: { fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname === '/v1/jurisdictions')
        return Response.json({ jurisdictions: [{ jurisdiction_code: '131148', name: '中野区', prefecture_name: '東京都', coverage: [2019, 2020, 2021, 2023, 2025].map((fiscal_year) => ({ fiscal_year, document_kind: 'settlement', accounts: [{ account_name: '一般会計' }] })) }] })
      if (url.pathname === '/v1/fiscal/expenditure/subjects:search') {
        const body = await req.json() as { fiscal_year: { min: number; max: number }; where: { level: { eq: string[] } } }
        if (body.fiscal_year.max - body.fiscal_year.min > 4) return Response.json({ error: 'fiscal_year は 5 年以内にしてください' }, { status: 400 })
        const rows = body.where.level.eq[0] === '款'
          ? [...KAN.filter((n) => n.fiscal_year === 2025), node({ node_id: id(4), node_kind: '款', name: '総務費', fiscal_year: 2021, amount_yen: 250 }), node({ node_id: id(5), node_kind: '款', name: '総務費', fiscal_year: 2023, amount_yen: 300 })]
          : MOKU_2025
        return Response.json({ subjects: rows.filter((n) => n.fiscal_year >= body.fiscal_year.min && n.fiscal_year <= body.fiscal_year.max).map(toSubject) })
      }
      return API.fetch(req)
    } } }
    const data = await view('/tokyo/nakano', sparse)
    expect(data.years.map((y: YearTotal) => [y.year, y.yen])).toEqual([[2021, 250], [2023, 300], [2025, 1000]])
    expect(data.projects[0]!.prevYen).toBeNull()
    const xml = await (await get('/sitemap.xml', sparse)).text()
    expect(xml).toContain('https://fudoki.dev/tokyo/nakano/2023')
    expect(xml).toContain('https://fudoki.dev/tokyo/nakano/2021')
    expect(xml).not.toContain('https://fudoki.dev/tokyo/nakano/2020')
    expect(xml).not.toContain('https://fudoki.dev/tokyo/nakano/2019')
  })

  test('API に繋がらないときは投げて（頁は 502）、sitemap は入口・一覧・アシスタントだけで答える', async () => {
    const down: Env = { API: { fetch: async () => new Response('x', { status: 500 }) } }
    await expect(resolveJurisdiction(down, '/tokyo/nakano')).rejects.toThrow()
    await expect(indexPageData(down)).rejects.toThrow()
    const sitemap = await get('/sitemap.xml', down)
    expect(sitemap.status).toBe(200)
    const xml = await sitemap.text()
    expect(xml).toContain('https://fudoki.dev/jurisdictions')
    expect(xml).toContain('https://fudoki.dev/assistant')
  })
})

describe('一覧の比較表の API', () => {
  test('並び・絞り込みを受けて30件ずつ返し、形の違う条件は 400 にする', async () => {
    const res = await get('/api/jurisdictions/table?sort=yen&order=asc&pref=13')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rows: { code: string }[]; total: number; next: number | null }
    expect([body.rows.map((r) => r.code), body.total, body.next]).toEqual([['131148'], 1, null])
    for (const bad of ['sort=drop', 'order=up', 'offset=-1', 'offset=1.5', 'pref=1', 'code=13114x', `code=${Array(2001).fill('131148').join(',')}`])
      expect((await get(`/api/jurisdictions/table?${bad}`)).status, bad).toBe(400)
  })

  test('値の無い自治体はどちらの向きでも末尾に置く', () => {
    const e = (code: string, perCapita: number | null) => ({ code, perCapita }) as IndexEntry
    const rows = [e('000003', null), e('000001', 10), e('000002', 20)]
    for (const desc of [true, false]) expect(queryIndex(rows, { ...DEFAULT_INDEX_QUERY, desc }).rows.map((r) => r.code).at(-1)).toBe('000003')
  })
})

describe('内訳の API', () => {
  test('全款を返し、1000件を超える項と目・節を省略しない', async () => {
    const north: Env = { ...env, API: fixtureApi({ code: '131172', name: '北区', extraNodes: Array.from({ length: 1001 }, (_, i) => node({ node_id: id(1000 + i), parent_node_id: id(2), node_kind: '項', name: `追加項${i}`, amount_yen: 0, fiscal_year: 2025 })) }) }
    const res = await get('/api/jurisdictions/flow/131172/2025/setsu', north)
    expect(res.status).toBe(200)
    const flows = await res.json() as { kan: { id: string }; kou: { moku: { setsu: unknown[] }[] }[] }[]
    expect(flows).toHaveLength(2)
    expect(flows.find((flow) => flow.kan.id === id(2))!.kou).toHaveLength(1002)
    expect(flows.find((flow) => flow.kan.id === id(1))!.kou[0]!.moku[0]!.setsu).toHaveLength(2)
  })

  test('印字のない項金額と印字された0円を区別して返す', async () => {
    const missing: Env = { ...env, API: fixtureApi({ code: '132012', name: '八王子市', extraNodes: [
      node({ node_id: id(20), parent_node_id: id(1), node_kind: '項', name: '子ども費', amount_yen: null, fiscal_year: 2025 }),
      node({ node_id: id(21), parent_node_id: id(2), node_kind: '項', name: '総務管理費', amount_yen: 0, fiscal_year: 2025 }),
    ] }) }
    for (const depth of ['kou', 'moku']) {
      const res = await get(`/api/jurisdictions/flow/132012/2025/${depth}`, missing)
      expect(res.status).toBe(200)
      const flows = await res.json() as { kan: { id: string }; kou: { yen: number; amountMissing?: true }[] }[]
      expect(flows.find((flow) => flow.kan.id === id(1))!.kou[0]!.amountMissing).toBe(true)
      expect(flows.find((flow) => flow.kan.id === id(2))!.kou[0]!.amountMissing).toBeUndefined()
      expect(flows.find((flow) => flow.kan.id === id(2))!.kou[0]!.yen).toBe(0)
    }
  })
  test('機能分類の流れは COFOG の大分類・中分類で目を分け、印字のない目を含む分類に amountMissing を付ける', async () => {
    const cofog: Env = { ...env, API: fixtureApi({ code: '132012', name: '八王子市', extraNodes: [
      node({ node_id: id(30), parent_node_id: id(20), node_kind: '目', name: '児童手当費', amount_yen: null, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費', cofog_code: '10.4' }),
      node({ node_id: id(31), parent_node_id: id(20), node_kind: '目', name: '学校費', amount_yen: 50, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費', cofog_code: '09.1' }),
      node({ node_id: id(32), parent_node_id: id(20), node_kind: '目', name: '保育費', amount_yen: 70, fiscal_year: 2025, kan_name: '子ども教育費', kou_name: '子ども費', cofog_code: '10' }),
    ] }) }
    const res = await get('/api/jurisdictions/flow/132012/2025/moku?view=cofog', cofog)
    expect(res.status).toBe(200)
    const flows = await res.json() as { kan: { id: string; name: string; yen: number; amountMissing?: true }; kou: { name: string; yen: number; amountMissing?: true; moku: { name: string }[] }[] }[]
    // 款（子ども教育費）は使わず、COFOG の名前で分ける
    const social = flows.find((f) => f.kan.id === 'cofog-10')!
    expect(social.kan).toMatchObject({ name: '福祉・子育て', yen: 70, amountMissing: true })
    expect(social.kou.map((k) => k.name)).toEqual(['未分類', '家族及び児童'])
    expect(social.kou[1]).toMatchObject({ yen: 0, amountMissing: true })
    expect(flows.find((f) => f.kan.id === 'cofog-09')!.kou[0]).toMatchObject({ name: '就学前教育及び初等教育', yen: 50, moku: [{ name: '学校費' }] })
    // COFOG の付かない目は「その他」に入り、最後に置く
    expect(flows.at(-1)!.kan.id).toBe('cofog-none')
    expect(flows.at(-1)!.kan.amountMissing).toBeUndefined()
  })
  test('後続ページの節を優先し、全ページの金額から上位の内訳を選ぶ', async () => {
    const paginated: Env = { ...env, API: { fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname !== `/v1/fiscal/expenditure/subjects/${id(11)}`) return API.fetch(req)
      const token = url.searchParams.get('page_token')
      const page = (details: Record<string, Row[]>, next: string | null) => Response.json({ subject: toSubject(MOKU_2025[1]!), children: [], details: Object.fromEntries(Object.entries(details).map(([k, rows]) => [k, rows.map(toDetail)])), next_page_token: next })
      if (!token)
        return page({ 事業: Array.from({ length: 100 }, (_, i) => node({ node_id: id(100 + i), parent_node_id: id(11), axis: '事業', is_subject: false, name: `事業${i}`, amount_yen: 5000 })) }, 'next1')
      if (token === 'next1')
        return page({ 節: [node({ axis: '節', is_subject: false, name: '委託料', amount_yen: 1000 }), node({ axis: '節', is_subject: false, name: '扶助費', amount_yen: 2000 })] }, 'next2')
      if (token === 'next2')
        return page({ 節: [node({ axis: '節', is_subject: false, name: '負担金補助及び交付金', amount_yen: 3000 }), node({ axis: '節', is_subject: false, name: '旅費', amount_yen: 500 })] }, null)
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
  test('款でない科目の流れは返さない', async () => {
    expect((await get(`/api/jurisdictions/drill/${id(11)}`)).status).toBe(502)
  })
})
