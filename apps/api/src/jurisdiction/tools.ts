// 自治体の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import { z } from 'zod'
import { pageSize, pageTokenOf, queryPageSize } from '../shared/paging'
import type { Tool } from '../shared/tool'
import { JurisdictionList } from './model'
import { DEFAULT_JURISDICTION_PAGE_SIZE, MAX_JURISDICTION_PAGE_SIZE, listJurisdictions, type ListInput } from './queries'

const MAX_NAME = 50

const filters = {
  name: z
    .string()
    .max(MAX_NAME)
    .regex(/^[^\u0000-\u001f\u007f]*$/, '制御文字は使えません')
    .optional()
    .describe('Partial municipality name (e.g. "武蔵野市", "府中"), compared after NFKC normalization. All municipalities with matching names are returned; distinguish them using prefecture_name and jurisdiction_code.'),
  code: z
    .string()
    .regex(/^[0-9]{5,6}$/, 'code は5桁か6桁の数字です')
    .optional()
    .describe('Japanese local government code: six digits including the check digit, or five digits without it.'),
  page_token: pageTokenOf('name and code'),
}

export const ListInputSchema = z.strictObject({ ...filters, page_size: pageSize(MAX_JURISDICTION_PAGE_SIZE, DEFAULT_JURISDICTION_PAGE_SIZE, 'municipalities') })
export const ListQuerySchema = z.strictObject({ ...filters, page_size: queryPageSize(MAX_JURISDICTION_PAGE_SIZE, DEFAULT_JURISDICTION_PAGE_SIZE, 'municipalities') })

const listDescription =
  'List municipality names, six-digit jurisdiction codes, prefectures, and what Fudoki covers: expenditure (fiscal years, document kinds and accounts), project evaluation years (evaluation_id for get_evaluation) and budget proposal years (budget_proposal_id for get_budget_proposal). ' +
  'Before searching expenditure, use this tool to check the municipality code and whether the years and document kinds you want to compare are covered. ' +
  'Filter by partial municipality name or a five- or six-digit code. Without filters, results are ordered by jurisdiction code. Pages default to 20 municipalities (maximum 100); follow next_page_token for more. Municipalities without data have empty coverage. ' +
  'When a wanted settlement year is not covered (for example, the municipality has not published its settlement document), do not treat it as zero; point the user to uncovered_sources, which hold official statistics at kan/kou level for the ordinary account (普通会計), not comparable to Fudoki general-account totals. ' +
  'Use returned jurisdiction_code (six digits), fiscal_year, document_kind and account_name directly in search_expenditure_subjects and search_expenditure_details. Search does not accept five-digit codes as matches: resolve the six-digit code here first. Name and code filters are combined with AND.'

export const jurisdictionTools = {
  list: {
    name: 'list_jurisdictions',
    title: 'Municipalities and coverage',
    description: listDescription,
    input: ListInputSchema,
    output: JurisdictionList,
    run: (ctx, input) => listJurisdictions(ctx, input as ListInput),
  },
} satisfies Record<string, Tool>
