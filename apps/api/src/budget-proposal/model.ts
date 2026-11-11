// 予算案の集約: 自治体の1年度（予算の年度）分の予算案のプレス発表。資料に載った施策（measure）を全部持つ。
// 守ること: 事業を指す施策は、その予算の年度の当初予算の行に当たっている。
import { z } from 'zod'
import { BUDGET_MEASURE_TABLE, described } from '../columns'
import { nextPageToken } from '../shared/paging'
import { yearSearchInputFor } from '../shared/search'
import { FiscalYear, JurisdictionCode, Origin, PagedOrigin, RowId, Yen } from '../shared/model'

/** 施策。資料の1件。出典と頁で1件が決まる */
export const Measure = z.strictObject({
  measure_id: z.string(),
  title: z.string().describe('施策名'),
  names: z.array(z.string()).describe('資料の事業名の欄。複数のことがある'),
  is_new: z.boolean().describe('新規の印'),
  description: z.string().describe('資料の説明文（品川は「ポイント」の箇条書きを改行でつないだもの）'),
  budget_yen: Yen.nullable(),
  expenditure_detail_id: z.string().nullable().describe('紐付けた当初予算書の内訳（歳出の集約の内訳の ID。風土記の判断）。当たらなければ空'),
  origin: PagedOrigin,
})
export type Measure = z.infer<typeof Measure>

export const BudgetProposal = z.strictObject({
  budget_proposal_id: z.string(),
  jurisdiction_code: JurisdictionCode,
  fiscal_year: FiscalYear.describe('予算の年度'),
  origins: z.array(Origin).min(1).describe('プレス発表の資料'),
  measures: z.array(Measure),
})
export type BudgetProposal = z.infer<typeof BudgetProposal>

// API の行。列は表（columns.json）のまま。列の集合・型・null の可否は model.test.ts が照合する。

export const BudgetProposalRow = z
  .strictObject(
    described('budget_proposal', {
      budget_proposal_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
    })
  )
  .meta({ id: 'BudgetProposalRow', description: '予算案の根（自治体 × 予算の年度）。' })

export const BudgetProposalOriginRow = z
  .strictObject(
    described('budget_proposal_origin', {
      origin_id: z.string(),
      budget_proposal_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
      title: z.string().nullable(),
      url: z.string(),
      landing_url: z.string().nullable(),
      sha256: z.string(),
    })
  )
  .meta({ id: 'BudgetProposalOriginRow', description: '予算案のプレス発表の資料。' })

export const MeasureRow = z
  .strictObject(
    described('budget_measure', {
      measure_id: z.string(),
      budget_proposal_id: z.string(),
      origin_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
      page: z.int(),
      title: z.string().nullable(),
      names: z.string().nullable(),
      is_new: z.boolean(),
      budget_yen: z.int().nullable(),
      description: z.string().nullable(),
      expenditure_detail_id: z.string().nullable(),
      link_method: z.string(),
      link_confidence: z.number().nullable(),
    })
  )
  .meta({ id: 'BudgetMeasureRow', description: '予算案の施策（資料の1件）。' })

const ORIGINS_HELP = '結果の行が指す出典。行の origin_id から引く。'

/** 1つの予算案に載る施策の上限。品川で年 89 件 */
export const MAX_MEASURES = 1000

export const BudgetProposalId = RowId('budget_proposal_id from a measure or search_budget_measures')

export const BudgetProposalOutput = z.strictObject({
  budget_proposal: BudgetProposalRow,
  measures: z.array(MeasureRow).describe(`資料に載った施策（資料・頁の順）。${MAX_MEASURES} 件まで。`),
  origins: z.array(BudgetProposalOriginRow).describe('プレス発表の資料。'),
})
export type BudgetProposalOutput = z.infer<typeof BudgetProposalOutput>

export const MeasureSearchInput = yearSearchInputFor(BUDGET_MEASURE_TABLE)
export const MeasureSearchOutput = z.strictObject({
  measures: z.array(MeasureRow),
  next_page_token: nextPageToken,
  origins: z.array(BudgetProposalOriginRow).describe(ORIGINS_HELP),
})
export type MeasureSearchOutput = z.infer<typeof MeasureSearchOutput>
