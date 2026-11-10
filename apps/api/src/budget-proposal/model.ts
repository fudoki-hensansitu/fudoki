// 予算案の集約: 自治体の1年度（予算の年度）分の予算案のプレス発表。資料に載った施策（measure）を全部持つ。
// 守ること: 事業を指す施策は、その予算の年度の当初予算の行に当たっている。
import { z } from 'zod'
import { FiscalYear, JurisdictionCode, Origin, PagedOrigin, Yen } from '../shared/model'

/** 施策。資料の1件。出典と頁で1件が決まる */
export const Measure = z.strictObject({
  measure_id: z.string(),
  title: z.string().describe('施策名'),
  names: z.array(z.string()).describe('資料の事業名の欄。複数のことがある'),
  is_new: z.boolean().describe('新規の印'),
  description: z.string().describe('資料の説明文（品川は「ポイント」の箇条書きを改行でつないだもの）'),
  budget_yen: Yen.nullable(),
  detail_id: z.string().nullable().describe('紐付けた当初予算書の内訳（風土記の判断）。当たらなければ空'),
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
