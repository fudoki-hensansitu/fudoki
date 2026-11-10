// 事業評価の集約: 自治体の1年度（評価した事業を行った年度）分の事務事業評価。評価結果の資料と評価シート全部を持つ。
// 守ること: シートを取り込んだ年度は、シートの数・A〜D の数が評価結果の資料の件数と合う。
import { z } from 'zod'
import { FiscalYear, JurisdictionCode, Origin, PagedOrigin, Yen } from '../shared/model'

export const Grade = z.enum(['A', 'B', 'C', 'D'])
export const EvaluationOriginType = z.enum(['sheets', 'result'])

/** 評価結果の資料に載る数（資料の値） */
export const GradeCounts = z.strictObject({
  evaluated: z.int().min(0).describe('評価した数'),
  A: z.int().min(0),
  B: z.int().min(0),
  C: z.int().min(0),
  D: z.int().min(0),
})

export const IndicatorYear = z.strictObject({
  fiscal_year: FiscalYear,
  target: z.string().nullable().describe('シートの表記のまま'),
  actual: z.string().nullable().describe('シートの表記のまま'),
})

export const Indicator = z.strictObject({
  indicator_id: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  definition: z.string().nullable(),
  final_target: z.string().nullable().describe('シートの表記のまま'),
  final_target_year: z.string().nullable().describe('シートの表記のまま（例: 令和8年度）'),
  years: z.array(IndicatorYear),
})

/** シートに印字された予算科目。事業に紐付けた根拠。読めない欄は空 */
export const BudgetSubject = z.strictObject({
  account: z.string().nullable(),
  kan: z.string().nullable(),
  kou: z.string().nullable(),
  moku: z.string().nullable(),
  jigyo: z.string().nullable(),
})

/** 評価シート。1枚 = 小事業の1年度。出典と頁で1枚が決まる */
export const EvaluationSheet = z.strictObject({
  sheet_id: z.string(),
  name: z.string().describe('小事業の名前。資料のまま'),
  budget_subject: BudgetSubject,
  department: z.string().nullable(),
  division: z.string().nullable(),
  budget_yen: Yen.nullable().describe('小事業の額。歳出の行とは足さない'),
  settled_yen: Yen.nullable(),
  grade: Grade,
  grade_label: z.string().nullable().describe('シートの表記。読めない欄は空'),
  direction: z.string().nullable().describe('今後の方向。シートの表記。読めない欄は空'),
  detail_id: z.string().nullable().describe('紐付けた決算書の内訳（風土記の判断）'),
  indicators: z.array(Indicator),
  origin: PagedOrigin,
})
export type EvaluationSheet = z.infer<typeof EvaluationSheet>

const rootCommon = {
  evaluation_id: z.string(),
  jurisdiction_code: JurisdictionCode,
  fiscal_year: FiscalYear.describe('評価した事業を行った年度'),
  sheets: z.array(EvaluationSheet).describe('シートを取り込んでいない年度は空'),
}

/** 事業評価の根。評価結果の資料があるかで形が違う */
export const Evaluation = z.discriminatedUnion('kind', [
  z.strictObject({ ...rootCommon, kind: z.literal('with_result'), result: PagedOrigin, counts: GradeCounts }),
  z.strictObject({ ...rootCommon, kind: z.literal('sheets_only') }),
])
export type Evaluation = z.infer<typeof Evaluation>
