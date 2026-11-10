// 事業評価・予算案・事業の操作（REST と MCP）。応答が出力の schema に合うか、404・ページ・bind を確かめる。
import { beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { createApp } from './app'
import { BudgetProposalOutput, MeasureSearchOutput } from './budget-proposal/model'
import type { Db } from './db'
import { EvaluationOutput, SheetOutput, SheetSearchOutput } from './evaluation/model'
import { ProjectOutput, ProjectSearchOutput } from './project/model'
import { testDb } from './testing'

let db: Db
let sqlite: Database
const app = createApp()
const H = (c: string) => c.repeat(64)
const EV = H('e')
const BP = H('b')
const get = (path: string) => app.request(path, {}, { DB: db })
const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { DB: db })

const insert = (table: string, row: Record<string, string | number | null>) => {
  const keys = Object.keys(row)
  sqlite.query(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(row))
}

beforeEach(() => {
  ;({ db, sqlite } = testDb())
  insert('evaluation', { evaluation_id: EV, jurisdiction_code: '131091', fiscal_year: 2024, kind: 'with_result', result_origin_id: 'r1', result_page: 3, evaluated_count: 3, grade_a: 1, grade_b: 1, grade_c: 1, grade_d: 0 })
  insert('evaluation_origin', { origin_id: 's1', evaluation_id: EV, jurisdiction_code: '131091', document_type: 'sheets', fiscal_year: 2024, title: '評価シート', url: 'https://example.test/s1.pdf', landing_url: null, sha256: H('1') })
  insert('evaluation_origin', { origin_id: 'r1', evaluation_id: EV, jurisdiction_code: '131091', document_type: 'result', fiscal_year: 2024, title: '評価結果', url: 'https://example.test/r1.pdf', landing_url: null, sha256: H('2') })
  for (const [i, grade] of ['A', 'B', 'C'].entries())
    insert('evaluation_sheet', {
      sheet_id: H(String(i)), evaluation_id: EV, origin_id: 's1', jurisdiction_code: '131091', fiscal_year: 2024, page: i + 1,
      name: `子ども事業${i}`, account_name: '一般会計', kan_name: '民生費', kou_name: null, moku_name: null, jigyo_name: null,
      department: null, division: null, budget_yen: 1000 * (i + 1), settled_yen: 900 * (i + 1), grade_code: grade, grade_label: null, direction: null, subject_id: null, detail_id: null,
    })
  insert('evaluation_indicator', { indicator_id: 'i1', sheet_id: H('0'), position: 1, name: '参加者数', unit: '人', definition: null, final_target_text: '100', final_target_year_text: '令和8年度' })
  insert('evaluation_indicator_value', { value_id: 'v1', indicator_id: 'i1', fiscal_year: 2024, target_text: '80', actual_text: '75' })
  insert('budget_proposal', { budget_proposal_id: BP, jurisdiction_code: '131091', fiscal_year: 2026 })
  insert('budget_proposal_origin', { origin_id: 'p1', budget_proposal_id: BP, jurisdiction_code: '131091', fiscal_year: 2026, title: '予算案の概要', url: 'https://example.test/p1.pdf', landing_url: null, sha256: H('3') })
  for (const [i, isNew] of [1, 0].entries())
    insert('budget_measure', {
      measure_id: H(String(5 + i)), budget_proposal_id: BP, origin_id: 'p1', jurisdiction_code: '131091', fiscal_year: 2026, page: i + 1,
      title: `施策${i}`, names: '["事業"]', is_new: isNew, budget_yen: 500, description: null, detail_id: null, link_method: 'none', link_confidence: null,
    })
})

describe('事業評価', () => {
  test('根・出典・シートを返し、シートはページに切る', async () => {
    const first = await (await get(`/v1/evaluations/${EV}?page_size=2`)).json()
    expect(EvaluationOutput.parse(first).sheets.map((s) => s.grade_code)).toEqual(['A', 'B'])
    expect(first.evaluation.grade_a).toBe(1)
    expect(first.origins.map((o: { document_type: string }) => o.document_type).sort()).toEqual(['result', 'sheets'])
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
      await (await post('/v1/evaluations/sheets:search', { fiscal_year: { min: 2024, max: 2024 }, where: { name: { contains: '子ども' }, grade_code: { eq: ['A', 'C'] } } })).json()
    )
    expect([body.sheets.length, body.origins.map((o) => o.origin_id)]).toEqual([2, ['s1']])
    expect((await post('/v1/evaluations/sheets:search', { where: {} })).status).toBe(400)
    expect((await post('/v1/evaluations/sheets:search', { document_kind: 'settlement', fiscal_year: { min: 2024, max: 2024 } })).status).toBe(400)
    const injected = await (await post('/v1/evaluations/sheets:search', { fiscal_year: { min: 2024, max: 2024 }, where: { name: { eq: [`x' OR 1=1 --`] } } })).json()
    expect(injected.sheets).toEqual([])
  })
})

describe('予算案', () => {
  test('根・施策・出典を返す', async () => {
    const body = BudgetProposalOutput.parse(await (await get(`/v1/budget-proposals/${BP}`)).json())
    expect([body.measures.length, body.measures[0]!.is_new, body.origins[0]!.origin_id]).toEqual([2, true, 'p1'])
    expect((await get(`/v1/budget-proposals/${H('f')}`)).status).toBe(404)
  })

  test('施策の検索は boolean で絞れる', async () => {
    const body = MeasureSearchOutput.parse(
      await (await post('/v1/budget-proposals/measures:search', { fiscal_year: { min: 2026, max: 2026 }, where: { is_new: { eq: true } } })).json()
    )
    expect(body.measures.map((m) => m.title)).toEqual(['施策0'])
  })
})

describe('事業', () => {
  const P = H('a')
  const CHILD = H('c')
  beforeEach(() => {
    sqlite.query(`UPDATE evaluation_sheet SET detail_id = 'd-settled' WHERE sheet_id = ?`).run(H('0'))
    sqlite.query(`UPDATE budget_measure SET detail_id = 'd-initial' WHERE measure_id = ?`).run(H('5'))
    for (const [id, name, parent] of [[P, '子育て支援費', null], [CHILD, '子育て相談', P]] as const)
      insert('project', { project_id: id, jurisdiction_code: '131091', name, account_name: '一般会計', first_year: 2024, first_year_kind: 'before_coverage', last_year: null, last_year_kind: 'latest', parent_project_id: parent })
    for (const [fy, budget, settled] of [[2024, 'd-old', 'd-settled'], [2026, 'd-initial', null]] as const)
      insert('project_year', {
        project_year_id: H(String(fy % 10)), project_id: P, jurisdiction_code: '131091', fiscal_year: fy, name: '子育て支援費', account_name: '一般会計',
        kan_name: '民生費', kou_name: '児童福祉費', moku_name: '児童福祉総務費', budget_detail_id: budget, settlement_detail_id: settled, budget_yen: 1000, settled_yen: settled ? 900 : null,
      })
  })

  test('事業は年度と直下の事業を返し、評価シートと施策は detail_id の検索で引く', async () => {
    const body = ProjectOutput.parse(await (await get(`/v1/projects/${P}`)).json())
    expect(body.years.map((y) => y.fiscal_year)).toEqual([2024, 2026])
    expect(body.children.map((c) => c.project_id)).toEqual([CHILD])
    expect(Object.keys(body).sort()).toEqual(['children', 'project', 'years'])
    const settled = body.years.flatMap((y) => (y.settlement_detail_id ? [y.settlement_detail_id] : []))
    const initial = body.years.flatMap((y) => (y.budget_detail_id ? [y.budget_detail_id] : []))
    const sheets = await (await post('/v1/evaluations/sheets:search', { fiscal_year: { min: 2024, max: 2026 }, where: { detail_id: { eq: settled } } })).json()
    expect(sheets.sheets.map((s: { sheet_id: string }) => s.sheet_id)).toEqual([H('0')])
    const measures = await (await post('/v1/budget-proposals/measures:search', { fiscal_year: { min: 2024, max: 2026 }, where: { detail_id: { eq: initial } } })).json()
    expect(measures.measures.map((m: { measure_id: string }) => m.measure_id)).toEqual([H('5')])
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
  })
})
