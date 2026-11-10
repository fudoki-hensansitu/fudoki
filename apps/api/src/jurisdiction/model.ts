// 自治体の集約。自治体コード・名前・都道府県を決める。
import { z } from 'zod'
import { described } from '../columns'
import { DocumentKind } from '../expenditure/model'
import { nextPageToken } from '../shared/paging'
import { JurisdictionCode } from '../shared/model'

export const Jurisdiction = z.strictObject({
  jurisdiction_code: JurisdictionCode,
  name: z.string().describe('自治体の名前（例: 武蔵野市）'),
  prefecture_code: z.string().regex(/^\d{2}$/),
  prefecture_name: z.string(),
  ocd_id: z.string(),
  official_url: z.url().nullable().describe('公式サイト'),
})
export type Jurisdiction = z.infer<typeof Jurisdiction>

// --- API の応答（docs/prd/aggregate-api/dd.md）。一覧は要約、1つの自治体は人口の推移と出典まで ---

export const PopulationPoint = z
  .strictObject({
    ...described('population', { reference_date: z.string(), male: z.int(), female: z.int(), population: z.int(), households: z.int() }),
    ...described('population_origin', { url: z.string() }),
  })
  .meta({ id: 'Population', description: '住民基本台帳人口（日本人住民と外国人住民の総計）。基準日時点の人数で、期間の値ではない。' })
export type PopulationPoint = z.infer<typeof PopulationPoint>

export const CoverageOrigin = z
  .strictObject(described('expenditure_origin', { origin_id: z.string(), title: z.string(), url: z.string(), format: z.string() }))
  .meta({ id: 'CoverageOrigin', description: '明細が指す出典（予算書・決算書の1冊）。' })

const coverageAccount = described('expenditure', { account_name: z.string(), account_kind: z.string() })
const coverageOf = <A extends z.ZodObject>(account: A, id: string) =>
  z
    .strictObject({
      fiscal_year: z.int().describe('会計年度（西暦）'),
      document_kind: DocumentKind,
      accounts: z.array(account).describe('明細がある会計。一般会計が先。'),
    })
    .meta({ id, description: '明細がある年度・資料区分と、その会計。' })

export const Coverage = coverageOf(z.strictObject(coverageAccount), 'Coverage')
export const CoverageWithOrigins = coverageOf(
  z.strictObject({ ...coverageAccount, origins: z.array(CoverageOrigin).describe('この会計の明細が指す出典すべて。') }),
  'CoverageWithOrigins'
)
export type Coverage = z.infer<typeof Coverage>
export type CoverageWithOrigins = z.infer<typeof CoverageWithOrigins>

const COVERAGE_HELP =
  '収録範囲（年度の昇順、同じ年度は当初予算・決算の順）。空なら、この自治体の明細は収録していない。明細があることを示し、会計全体・全事業を収録し終えたことは保証しない。'
const POPULATION_MATCH_HELP =
  '決算・予算の N 年度と比べるときは、N+1 年1月1日の値を当てる（地方財政状況調査の決算カードと同じ）。その値がまだ無い年度は、いちばん新しい基準日の値を選び、使った基準日を添える。'

const jurisdictionFields = described('jurisdiction', {
  jurisdiction_code: z.string(),
  name: z.string(),
  prefecture_code: z.string(),
  prefecture_name: z.string(),
  ocd_id: z.string(),
  official_url: z.string().nullable(),
})
const EvaluationRef = z
  .strictObject({ evaluation_id: z.string(), fiscal_year: z.int().describe('評価した事業を行った年度') })
  .meta({ id: 'EvaluationRef', description: '収録した事業評価の年度。get_evaluation に evaluation_id を渡す。' })
const BudgetProposalRef = z
  .strictObject({ budget_proposal_id: z.string(), fiscal_year: z.int().describe('予算の年度') })
  .meta({ id: 'BudgetProposalRef', description: '収録した予算案の年度。get_budget_proposal に budget_proposal_id を渡す。' })
const refs = {
  evaluations: z.array(EvaluationRef).describe('収録した事業評価（年度の昇順）。'),
  budget_proposals: z.array(BudgetProposalRef).describe('収録した予算案（年度の昇順）。'),
}

/** 一覧の1行（要約） */
export const JurisdictionSummary = z
  .strictObject({
    ...jurisdictionFields,
    population: z.array(PopulationPoint).describe(`住民基本台帳人口（基準日の昇順）。${POPULATION_MATCH_HELP}`),
    coverage: z.array(Coverage).describe(COVERAGE_HELP),
    ...refs,
  })
  .meta({ id: 'JurisdictionSummary', description: '自治体と、その収録範囲の要約。' })
export type JurisdictionSummary = z.infer<typeof JurisdictionSummary>

export const UncoveredSource = z
  .strictObject({ title: z.string(), url: z.string(), description: z.string() })
  .meta({ id: 'UncoveredSource', description: '収録の無い年度で使える、風土記の外の統計の出典。' })

export const UNCOVERED_SOURCES_HELP =
  '収録の無い自治体・年度の決算を見たいときの、風土記の外の統計の出典（どの自治体でも同じ）。風土記はこの数字を取り込まない。' +
  'どれも普通会計の決算で、事業（目）の単位は無く、風土記の一般会計とは範囲が違い合計も一致しない。当初予算と未公表の年度の数字は無い。'

export const JurisdictionList = z.strictObject({
  jurisdictions: z.array(JurisdictionSummary).describe('自治体コードの昇順。'),
  next_page_token: nextPageToken,
  uncovered_sources: z.array(UncoveredSource).describe(UNCOVERED_SOURCES_HELP),
})
export type JurisdictionList = z.infer<typeof JurisdictionList>

/** 1つの自治体（人口の推移と、会計ごとの出典まで） */
export const JurisdictionDetail = z.strictObject({
  ...jurisdictionFields,
  population: z.array(PopulationPoint).describe(`住民基本台帳人口（基準日の昇順）。${POPULATION_MATCH_HELP}`),
  coverage: z.array(CoverageWithOrigins).describe(COVERAGE_HELP),
  ...refs,
  uncovered_sources: z.array(UncoveredSource).describe(UNCOVERED_SOURCES_HELP),
})
export type JurisdictionDetail = z.infer<typeof JurisdictionDetail>
