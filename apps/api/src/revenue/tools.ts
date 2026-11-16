// 歳入の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import type { Tool } from '../shared/tool'
import type { SearchInput } from '../shared/search'
import { RevenueDetailSearchInput, RevenueDetailSearchOutput, RevenueInput, RevenueLineInput, RevenueLineOutput, RevenueOutput, RevenueSubjectSearchInput, RevenueSubjectSearchOutput } from './model'
import { getRevenue, getRevenueLine, searchRevenueDetails, searchRevenueSubjects } from './queries'
import { INPUT_HELP } from '../expenditure/tools'

const getRevenueDescription =
  'Get revenue (歳入) of one municipality: for each document (fiscal year, document kind) and account, the total and the kan (款) with printed amounts. ' +
  'Settlement amounts are received amounts (収入済額); initial amounts are the initial budget. Never add initial and settlement amounts. The kan add up to total_yen. ' +
  'category is a Fudoki judgment that groups kan of municipal general accounts: local taxes (まちの税), money distributed by the national and prefectural governments without a set purpose (国・都道府県から配られるお金: shared taxes, grants and 地方交付税), ' +
  'national and prefectural disbursements for set purposes (国・都道府県の支出金), borrowing (借入れ) and other. Use list_jurisdictions to find the six-digit code first. ' +
  'Revenue is covered for fewer municipalities than expenditure; an empty list means not covered, not zero.'

export const REVENUE_SUBJECT_SEARCH_EXAMPLE = {
  document_kind: 'initial',
  fiscal_year: { min: 2026, max: 2026 },
  where: { jurisdiction_code: { eq: ['131091'] }, kan_name: { eq: ['特別区税'] }, level: { eq: ['項'] } },
  order_by: [{ column: 'amount_yen', desc: true }],
  page_size: 50,
}

const searchSubjectsDescription =
  'Search revenue subjects: 款/kan, 項/kou and 目/moku printed in budget and settlement documents (level column), e.g. the 項 of a local-tax kan such as 特別区民税 or 市民税・固定資産税. ' +
  'Settlement amounts are received amounts (収入済額); initial amounts are the initial budget. Text filters match printed names (name, kan_name, kou_name, moku_name); category is the Fudoki revenue category of the kan (see get_revenue). ' +
  INPUT_HELP +
  ' Adding amounts: rows with level "款" of one municipality, year, document kind and account add up to total revenue; so do rows with is_leaf = true. Never mix parents and children. ' +
  'Revenue is covered for fewer municipalities than expenditure; an empty list means not covered, not zero.'

export const REVENUE_DETAIL_SEARCH_EXAMPLE = {
  document_kind: 'initial',
  fiscal_year: { min: 2026, max: 2026 },
  where: { jurisdiction_code: { eq: ['131091'] }, kan_name: { eq: ['特別区税'] }, depth: { eq: [1] } },
  order_by: [{ column: 'amount_yen', desc: true }],
  page_size: 50,
}

const searchDetailsDescription =
  'Search revenue details: items printed below a revenue subject (mostly 目), such as 節 (e.g. 現年課税分・滞納繰越分 under a tax 目) and the lines printed below them. ' +
  'Revenue 節 classify kinds of income and are not the statutory expenditure setsu. Settlement amounts are received amounts (収入済額); initial amounts are the initial budget. ' +
  INPUT_HELP +
  ' Adding amounts: rows with depth = 1 under one subject add up to the subject amount (except rows without a printed amount). Never mix depths. ' +
  'Revenue is covered for fewer municipalities than expenditure; an empty list means not covered, not zero.'

const getLineDescription =
  'Return one revenue subject (款/項/目) by id with its child subjects (項 below a 款, 目 below a 項), print locations and sources. Child subjects add up to the subject amount.'

export const revenueTools = {
  get: {
    name: 'get_revenue',
    title: 'Revenue by kan',
    description: getRevenueDescription,
    input: RevenueInput,
    output: RevenueOutput,
    run: (ctx, input) => getRevenue(ctx, input as RevenueInput),
  },
  searchSubjects: {
    name: 'search_revenue_subjects',
    title: 'Search revenue subjects (kan, kou, moku)',
    description: searchSubjectsDescription,
    input: RevenueSubjectSearchInput,
    output: RevenueSubjectSearchOutput,
    run: (ctx, input) => searchRevenueSubjects(ctx, input as SearchInput),
  },
  searchDetails: {
    name: 'search_revenue_details',
    title: 'Search revenue details (setsu)',
    description: searchDetailsDescription,
    input: RevenueDetailSearchInput,
    output: RevenueDetailSearchOutput,
    run: (ctx, input) => searchRevenueDetails(ctx, input as SearchInput),
  },
  getLine: {
    name: 'get_revenue_line',
    title: 'Revenue subject with its children',
    description: getLineDescription,
    input: RevenueLineInput,
    output: RevenueLineOutput,
    run: (ctx, input) => getRevenueLine(ctx, input as RevenueLineInput),
  },
} satisfies Record<string, Tool>
