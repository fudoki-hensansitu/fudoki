// 事業評価・事業の操作（REST と MCP）。応答が出力の schema に合うか、404・ページ・bind を確かめる。
import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createApp } from './app'
import type { Db } from './db'
import { EvaluationOutput, SheetOutput, SheetSearchOutput, type SheetCountOutput } from './evaluation/model'
import { callWebOp } from './web-ops'
import { ProjectOutput, ProjectSearchOutput } from './project/model'
import { testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()
const H = (c: string) => c.repeat(64)
const EV = H('e')
const get = (path: string) => app.request(path, {}, { DB: db })
const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { DB: db })

const insert = (table: string, row: Record<string, string | number | null>) => {
  const keys = Object.keys(row)
  sqlite.query(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(row))
}

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insert('evaluation', { evaluation_id: EV, jurisdiction_code: '131091', fiscal_year: 2024 })
  insert('evaluation_origin', { origin_id: 's1', evaluation_id: EV, jurisdiction_code: '131091', fiscal_year: 2024, title: '評価シート', url: 'https://example.test/s1.pdf', landing_url: null, sha256: H('1') })
  for (const [i, code] of ['expand', 'keep', 'improve'].entries())
    insert('evaluation_sheet', {
      sheet_id: H(String(i)), evaluation_id: EV, origin_id: 's1', jurisdiction_code: '131091', fiscal_year: 2024, page: i + 1,
      name: `子ども事業${i}`, account_name: '一般会計', kan_name: '民生費', kou_name: null, moku_name: null, jigyo_name: null,
      department: null, division: null, budget_yen: 1000 * (i + 1), settled_yen: 900 * (i + 1), grade_label: null, direction: null, direction_code: code, kan_code: null, kou_code: null, moku_code: null, initial_expenditure_subject_id: null, settlement_expenditure_subject_id: null,
    })
  insert('evaluation_indicator', { indicator_id: 'i1', sheet_id: H('0'), position: 1, name: '参加者数', unit: '人', definition: null, final_target_text: '100', final_target_year_text: '令和8年度' })
  insert('evaluation_indicator_value', { value_id: 'v1', indicator_id: 'i1', fiscal_year: 2024, target_text: '80', actual_text: '75' })
})

describe('事業評価', () => {
  test('根・出典・シートを返し、シートはページに切る', async () => {
    const first = await (await get(`/v1/evaluations/${EV}?page_size=2`)).json()
    expect(EvaluationOutput.parse(first).sheets.map((s) => s.outlook?.grade)).toEqual(['A', 'B'])
    expect(first.origins.map((o: { origin_id: string }) => o.origin_id)).toEqual(['s1'])
    const second = await (await get(`/v1/evaluations/${EV}?page_size=2&page_token=${first.next_page_token}`)).json()
    expect([second.sheets.length, second.next_page_token]).toEqual([1, null])
    expect((await get(`/v1/evaluations/${H('f')}`)).status).toBe(404)
    expect((await get('/v1/evaluations/xyz')).status).toBe(400)
  })

  test('シートは指標と年度の値・出典まで返す', async () => {
    const body = SheetOutput.parse(await (await get(`/v1/evaluations/sheets/${H('0')}`)).json())
    expect([body.indicators[0]!.name, body.indicator_values[0]!.actual_text, body.origins[0]!.origin_id]).toEqual(['参加者数', '75', 's1'])
    expect((await get(`/v1/evaluations/sheets/${H('f')}`)).status).toBe(404)
  })

  test('シートの検索は年度が必須で、値は bind する', async () => {
    const body = SheetSearchOutput.parse(
      await (await post('/v1/evaluations/sheets:search', { fiscal_year: { min: 2024, max: 2024 }, where: { name: { contains: '子ども' }, direction_code: { eq: ['expand', 'improve'] } } })).json()
    )
    expect([body.sheets.length, body.origins.map((o) => o.origin_id)]).toEqual([2, ['s1']])
    expect((await post('/v1/evaluations/sheets:search', { where: {} })).status).toBe(400)
    expect((await post('/v1/evaluations/sheets:search', { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } })).status).toBe(400)
    const injected = await (await post('/v1/evaluations/sheets:search', { fiscal_year: { min: 2024, max: 2024 }, where: { name: { eq: [`x' OR 1=1 --`] } } })).json()
    expect(injected.sheets).toEqual([])
  })
})

describe('事業評価の数（web だけの count_evaluation_sheets）', () => {
  test('条件に当たるシートを方向性の区分ごとに数え、区分の当たらないシートは outlook を空にまとめる', async () => {
    insert('evaluation_sheet', {
      sheet_id: H('9'), evaluation_id: EV, origin_id: 's1', jurisdiction_code: '131091', fiscal_year: 2024, page: 9,
      name: '区分の無い事業', account_name: '一般会計', kan_name: '民生費', kou_name: null, moku_name: null, jigyo_name: null,
      department: null, division: null, budget_yen: 1, settled_yen: 1, grade_label: null, direction: null, direction_code: null, kan_code: null, kou_code: null, moku_code: null, initial_expenditure_subject_id: null, settlement_expenditure_subject_id: null,
    })
    const year = { min: 2024, max: 2024 }
    const all = await callWebOp({ DB: db }, 'count_evaluation_sheets', { fiscal_year: year, where: { jurisdiction_code: { eq: ['131091'] } } })
    const counts = all.ok ? (all.value as SheetCountOutput).counts.map((c) => [c.outlook?.code ?? null, c.outlook?.grade ?? null, c.size]) : null
    expect(counts).toEqual([[null, null, 1], ['expand', 'A', 1], ['improve', 'C', 1], ['keep', 'B', 1]])
    // 検索と同じ条件で絞る
    const some = await callWebOp({ DB: db }, 'count_evaluation_sheets', { fiscal_year: year, where: { name: { contains: '子ども' }, direction_code: { eq: ['expand', 'keep'] } } })
    expect(some.ok && (some.value as SheetCountOutput).counts.map((c) => c.size)).toEqual([1, 1])
    expect(await callWebOp({ DB: db }, 'count_evaluation_sheets', { where: {} })).toMatchObject({ ok: false, status: 400 })
  })
})

describe('事業', () => {
  const P = H('a')
  const CHILD = H('c')
  beforeEach(() => {
    insert('evaluation_sheet_project', { link_id: H('e'), sheet_id: H('0'), jurisdiction_code: '131091', fiscal_year: 2024, project_id: P, method: 'code' })
    for (const [id, parent] of [[P, null], [CHILD, P]] as const)
      insert('project', { project_id: id, jurisdiction_code: '131091', first_year: 2024, first_year_kind: 'before_coverage', last_year: null, last_year_kind: 'latest', parent_project_id: parent })
    // 名前・款項目・金額は事業の年度が指す内訳から引く
    for (const [id, fy, kind, name, yen] of [['d-old', 2024, 'initial', '子育て支援費', 1000], ['d-settled', 2024, 'settlement', '子育て支援費', 900], ['d-initial', 2026, 'initial', '子育て支援費', 1000], ['d-child', 2026, 'initial', '家庭相談', 100]] as const)
      insert('expenditure_detail', {
        detail_id: id, subject_id: `s-${kind}`, jurisdiction_code: '131091', fiscal_year: fy, document_kind: kind, account_name: '一般会計',
        kan_name: '民生費', kou_name: '児童福祉費', moku_name: '児童福祉総務費', breakdown: '事業', depth: 1, name, amount_yen: yen,
      })
    for (const [yid, pid, fy, budget, settled] of [[H('4'), P, 2024, 'd-old', 'd-settled'], [H('6'), P, 2026, 'd-initial', null], [H('7'), CHILD, 2026, 'd-child', null]] as const)
      insert('project_year', { project_year_id: yid, project_id: pid, fiscal_year: fy, initial_expenditure_detail_id: budget, settlement_expenditure_detail_id: settled })
  })

  test('事業は年度と直下の事業を返し、評価シートはつなぎの表で引く', async () => {
    const body = ProjectOutput.parse(await (await get(`/v1/projects/${P}`)).json())
    expect(body.years.map((y) => y.fiscal_year)).toEqual([2024, 2026])
    expect(body.children.map((c) => c.project_id)).toEqual([CHILD])
    expect(Object.keys(body).sort()).toEqual(['children', 'project', 'years'])
    const sheets = await (await post('/v1/evaluations/sheets:search', { fiscal_year: { min: 2024, max: 2026 }, project_ids: [P] })).json()
    expect(sheets.sheets.map((s: { sheet_id: string; project_ids: string[] }) => [s.sheet_id, s.project_ids])).toEqual([[H('0'), [P]]])
    expect((await get(`/v1/projects/${H('f')}`)).status).toBe(404)
    expect((await get('/v1/projects/xyz')).status).toBe(400)
  })

  test('事業の年度の検索は年度が必須で、値は bind する', async () => {
    expect((await post('/v1/projects:search', { where: {} })).status).toBe(400)
    const body = ProjectSearchOutput.parse(
      await (await post('/v1/projects:search', { fiscal_year: { min: 2026, max: 2026 }, where: { name: { contains: "子育て' OR 1=1 --" } } })).json()
    )
    expect(body.project_years).toEqual([])
    const hit = ProjectSearchOutput.parse(await (await post('/v1/projects:search', { fiscal_year: { min: 2024, max: 2026 }, where: { name: { contains: '子育て' } } })).json())
    expect(hit.project_years.map((y) => y.fiscal_year).sort()).toEqual([2024, 2026])
    expect(hit.projects.map((p) => [p.project_id, p.first_year_kind, p.last_year_kind])).toEqual([[P, 'before_coverage', 'latest']])
    expect([hit.total_size, hit.total_size_capped]).toEqual([2, false])
    // 事業の列（親・終えた年度）は project にだけあり、検索の中で JOIN して絞る
    const top = ProjectSearchOutput.parse(await (await post('/v1/projects:search', { fiscal_year: { min: 2024, max: 2026 }, where: { parent_project_id: { is_null: true }, last_year_kind: { eq: ['latest'] } } })).json())
    expect(top.project_years.map((y) => y.project_id)).toEqual([P, P])
    const ended = ProjectSearchOutput.parse(await (await post('/v1/projects:search', { fiscal_year: { min: 2024, max: 2026 }, where: { last_year_kind: { eq: ['confirmed'] } } })).json())
    expect([ended.project_years, ended.projects, ended.total_size]).toEqual([[], [], 0])
  })

  test('合計件数は 10,000 で数えるのをやめる', async () => {
    const add = sqlite.prepare(`INSERT INTO project_year ("project_year_id", "project_id", "fiscal_year", "initial_expenditure_detail_id") VALUES (?, ?, 2025, 'd-initial')`)
    sqlite.transaction(() => {
      for (let i = 0; i < 10_001; i++) add.run(`py-${i}`, P)
    })()
    const body = ProjectSearchOutput.parse(await (await post('/v1/projects:search', { fiscal_year: { min: 2025, max: 2025 }, page_size: 1 })).json())
    expect([body.total_size, body.total_size_capped, body.project_years.length]).toEqual([10_000, true, 1])
  })
})
