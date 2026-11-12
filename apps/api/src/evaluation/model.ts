// 事業評価の集約: 自治体の1年度（評価した事業を行った年度）分の事務事業評価。評価結果の資料と評価シート全部を持つ。
// 守ること: シートを取り込んだ年度は、シートの数・A〜D の数が評価結果の資料の件数と合う。
import { z } from 'zod'
import { EVALUATION_SHEET_TABLE, described } from '../columns'
import { nextPageToken } from '../shared/paging'
import { yearSearchInputFor } from '../shared/search'
import { FiscalYear, JurisdictionCode, PagedOrigin, RowId, Yen } from '../shared/model'

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
  grade: Grade.nullable().describe('風土記の4区分。区分の無い様式・当たらない印字は空'),
  grade_label: z.string().nullable().describe('シートの表記。読めない欄は空'),
  direction: z.string().nullable().describe('今後の方向。シートの表記。読めない欄は空'),
  expenditure_detail_id: z.string().nullable().describe('紐付けた決算書の内訳（歳出の集約の内訳の ID。風土記の判断）'),
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

// API の行。列は表（columns.json）のまま。列の集合・型・null の可否・accepted_values は model.test.ts が照合する。

export const EvaluationKind = z.enum(['with_result', 'sheets_only'])

export const EvaluationRow = z
  .strictObject(
    described('evaluation', {
      evaluation_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
      kind: EvaluationKind,
      result_origin_id: z.string().nullable(),
      result_page: z.int().nullable(),
      evaluated_count: z.int().nullable(),
      grade_a: z.int().nullable(),
      grade_b: z.int().nullable(),
      grade_c: z.int().nullable(),
      grade_d: z.int().nullable(),
    })
  )
  .meta({ id: 'EvaluationRow', description: '事業評価の根（自治体 × 評価した事業を行った年度）。' })

export const EvaluationOriginRow = z
  .strictObject(
    described('evaluation_origin', {
      origin_id: z.string(),
      evaluation_id: z.string(),
      jurisdiction_code: z.string(),
      document_type: EvaluationOriginType,
      fiscal_year: z.int(),
      title: z.string().nullable(),
      url: z.string(),
      landing_url: z.string().nullable(),
      sha256: z.string(),
    })
  )
  .meta({ id: 'EvaluationOriginRow', description: '事業評価の出典（評価シートの冊・評価結果の資料）。' })

export const SheetRow = z
  .strictObject(
    described('evaluation_sheet', {
      sheet_id: z.string(),
      evaluation_id: z.string(),
      origin_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
      page: z.int(),
      name: z.string(),
      account_name: z.string().nullable(),
      kan_name: z.string().nullable(),
      kou_name: z.string().nullable(),
      moku_name: z.string().nullable(),
      jigyo_name: z.string().nullable(),
      department: z.string().nullable(),
      division: z.string().nullable(),
      budget_yen: z.int().nullable(),
      settled_yen: z.int().nullable(),
      grade_code: Grade.nullable(),
      grade_label: z.string().nullable(),
      direction: z.string().nullable(),
      expenditure_subject_id: z.string().nullable(),
      expenditure_detail_id: z.string().nullable(),
    })
  )
  .meta({ id: 'EvaluationSheetRow', description: '評価シート（1枚 = 小事業の1年度）。' })

export const IndicatorRow = z
  .strictObject(
    described('evaluation_indicator', {
      indicator_id: z.string(),
      sheet_id: z.string(),
      position: z.int(),
      name: z.string().nullable(),
      unit: z.string().nullable(),
      definition: z.string().nullable(),
      final_target_text: z.string().nullable(),
      final_target_year_text: z.string().nullable(),
    })
  )
  .meta({ id: 'EvaluationIndicatorRow', description: '評価シートの指標。' })

export const IndicatorValueRow = z
  .strictObject(
    described('evaluation_indicator_value', {
      value_id: z.string(),
      indicator_id: z.string(),
      fiscal_year: z.int(),
      target_text: z.string().nullable(),
      actual_text: z.string().nullable(),
    })
  )
  .meta({ id: 'EvaluationIndicatorValueRow', description: '指標の年度ごとの目標と実績（シートの表記のまま）。' })

const ORIGINS_HELP = '結果の行が指す出典。行の origin_id・result_origin_id から引く。'

export const EvaluationId = RowId('evaluation_id from a sheet or search_evaluation_sheets')
export const SheetId = RowId('sheet_id from get_evaluation or search_evaluation_sheets')

export const EvaluationOutput = z.strictObject({
  evaluation: EvaluationRow,
  sheets: z.array(SheetRow).describe('評価シート（ページ）。シートを取り込んでいない年度は空。'),
  next_page_token: nextPageToken.describe('sheets の次のページの token。無ければ null。'),
  origins: z.array(EvaluationOriginRow).describe('この年度の事業評価の出典（評価シートの冊と評価結果の資料）。'),
})
export type EvaluationOutput = z.infer<typeof EvaluationOutput>

export const SheetOutput = z.strictObject({
  sheet: SheetRow,
  indicators: z.array(IndicatorRow).describe('シートの指標（position の順）。'),
  indicator_values: z.array(IndicatorValueRow).describe('指標の年度ごとの目標と実績。indicator_id で indicators に結ぶ。'),
  origins: z.array(EvaluationOriginRow).describe(ORIGINS_HELP),
})
export type SheetOutput = z.infer<typeof SheetOutput>

export const SheetSearchInput = yearSearchInputFor(EVALUATION_SHEET_TABLE)
export const SheetSearchOutput = z.strictObject({
  sheets: z.array(SheetRow),
  next_page_token: nextPageToken,
  origins: z.array(EvaluationOriginRow).describe(ORIGINS_HELP),
})
export type SheetSearchOutput = z.infer<typeof SheetSearchOutput>
