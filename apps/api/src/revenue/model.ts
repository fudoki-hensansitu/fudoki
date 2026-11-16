// 歳入の集約: 1つの資料（自治体・年度・資料区分・補正号）の1つの会計の歳入全体。
// 守ること: 款の和が総額。区分は風土記の判断（seed fiscal_revenue_category）で、款の名前で引く。
import { z } from 'zod'
import { REVENUE_SUBJECT_TABLE, described } from '../columns'
import { OriginRow } from '../expenditure/model'
import { nextPageToken } from '../shared/paging'
import { searchInputFor } from '../shared/search'
import { DocumentKind, FiscalYear, JurisdictionCode, Origin, OriginFormat, Yen } from '../shared/model'

export const RevenueCategory = z
  .enum(['まちの税', '国・都道府県から配られるお金', '国・都道府県の支出金', '借入れ', 'その他'])
  .describe('Fudoki judgment: revenue category of the kan, looked up by the kan name. Covers kan of municipal general accounts; null where the name is not in the table (other accounts, prefectures).')

export const RevenueKan = z.strictObject({
  subject_id: z.string(),
  code: z.string().nullable().describe('Printed kan number'),
  name: z.string().describe('Printed kan name (NFKC-normalized)'),
  amount_yen: Yen.nullable().describe('Amount of the document kind: received (収入済額) for settlement, initial budget for initial'),
  category: RevenueCategory.nullable(),
  page: z.int().min(1).nullable().describe('Page of the origin file where the kan name is printed'),
  origin_id: z.string().nullable().describe('Origin file the page refers to (one of origins[].origin_id)'),
})

export const Revenue = z.strictObject({
  revenue_id: z.string(),
  jurisdiction_code: JurisdictionCode,
  fiscal_year: FiscalYear,
  document_kind: DocumentKind,
  amendment_number: z.int().nullable(),
  account_name: z.string().describe('Account name as printed'),
  account_kind: z.string().describe('Account kind shared across municipalities (account_kind_map)'),
  total_yen: Yen.describe('Sum of the kan'),
  kan: z.array(RevenueKan).describe('Kan in printed order'),
  origins: z.array(Origin.extend({ format: OriginFormat })),
})

export const RevenueInput = z.strictObject({
  jurisdiction_code: JurisdictionCode,
  fiscal_year: FiscalYear.optional().describe('Only this fiscal year (Gregorian). All covered years when omitted.'),
  document_kind: DocumentKind.optional().describe('Only this document kind. Never add initial and settlement amounts.'),
  account_kind: z.string().max(50).optional().describe('Only this account kind (e.g. "一般会計"). All accounts when omitted.'),
})

/** REST の query（文字列で届く年度を数にする） */
export const RevenueQuery = RevenueInput.extend({
  fiscal_year: z.coerce.number().int().min(1900).max(2200).optional().describe(RevenueInput.shape.fiscal_year.description ?? ''),
})

export const RevenueOutput = z.strictObject({
  revenues: z.array(Revenue).describe('Newest fiscal year first; the general account first within a document'),
})
export type RevenueOutput = z.infer<typeof RevenueOutput>
export type RevenueInput = z.infer<typeof RevenueInput>

// --- 歳入の科目（款・項・目）の検索と行の取得。歳出の search_expenditure_subjects・get_expenditure_line と同じ形 ---

const revenueSubjectShape = described(REVENUE_SUBJECT_TABLE.columns, {
  subject_id: z.string(),
  node_key: z.string(),
  parent_subject_id: z.string().nullable(),
  revenue_id: z.string(),
  jurisdiction_code: z.string(),
  fiscal_year: z.int(),
  document_kind: z.enum(['settlement', 'initial']),
  amendment_number: z.int().nullable(),
  amount_phase: z.enum(['executed', 'approved']),
  account_name: z.string(),
  account_kind: z.string(),
  level: z.enum(['款', '項', '目']),
  code: z.string().nullable(),
  name: z.string(),
  kan_code: z.string().nullable(),
  kan_name: z.string(),
  kou_code: z.string().nullable(),
  kou_name: z.string().nullable(),
  moku_code: z.string().nullable(),
  moku_name: z.string().nullable(),
  amount_yen: z.int().nullable(),
  is_leaf: z.boolean(),
  category: RevenueCategory.nullable(),
  origin_id: z.string(),
})
export const RevenueSubjectRow = z.strictObject(revenueSubjectShape).meta({ id: 'RevenueSubjectRow', description: '歳入の科目（款・項・目）。' })

export const RevenueLocationRow = z
  .strictObject(
    described('revenue_location', {
      line_id: z.string(),
      origin_id: z.string(),
      source_page: z.int().nullable(),
      source_x0: z.number().nullable(),
      source_y0: z.number().nullable(),
      source_x1: z.number().nullable(),
      source_y1: z.number().nullable(),
      amount_source_page: z.int().nullable(),
      amount_source_x0: z.number().nullable(),
      amount_source_y0: z.number().nullable(),
      amount_source_x1: z.number().nullable(),
      amount_source_y1: z.number().nullable(),
    })
  )
  .meta({ id: 'RevenueLocationRow', description: '歳入の科目が印字された出典の位置（頁と枠）。line_id は subject_id。' })

export const RevenueSubjectSearchInput = searchInputFor(REVENUE_SUBJECT_TABLE)
export const RevenueSubjectSearchOutput = z.strictObject({
  subjects: z.array(RevenueSubjectRow),
  next_page_token: nextPageToken,
  origins: z.array(OriginRow).describe('結果の行が指す出典。行の origin_id から引く。'),
})
export type RevenueSubjectSearchOutput = z.infer<typeof RevenueSubjectSearchOutput>

export const RevenueLineId = z.string().regex(/^[0-9a-f]{64}$/).describe('subject_id from a revenue search response (64 lowercase hexadecimal characters).')
export const RevenueLineInput = z.strictObject({ line_id: RevenueLineId })
export type RevenueLineInput = z.infer<typeof RevenueLineInput>

/** 歳入の科目と、その子の科目（款なら項、項なら目） */
export const RevenueLineOutput = z.strictObject({
  line: RevenueSubjectRow,
  child_subjects: z.array(RevenueSubjectRow).describe('子の科目（款なら項、項なら目）。ページを切らずに返す。'),
  locations: z.array(RevenueLocationRow).describe('行と子の科目が印字された位置。subject_id を line_id で引く。'),
  origins: z.array(OriginRow).describe('行と子の科目が印字された出典。'),
})
export type RevenueLineOutput = z.infer<typeof RevenueLineOutput>
