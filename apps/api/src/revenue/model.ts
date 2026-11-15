// 歳入の集約: 1つの資料（自治体・年度・資料区分・補正号）の1つの会計の歳入全体。
// 守ること: 款の和が総額。区分は風土記の判断（seed fiscal_revenue_category）で、款の名前で引く。
import { z } from 'zod'
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
