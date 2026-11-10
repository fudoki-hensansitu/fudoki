// 予算案の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import { z } from 'zod'
import { MAX_BINDS, MAX_LIST, MAX_YEARS, type SearchInput } from '../shared/search'
import type { Tool } from '../shared/tool'
import { BudgetProposalId, BudgetProposalOutput, MeasureSearchInput, MeasureSearchOutput } from './model'
import { getBudgetProposal, searchMeasures } from './queries'

export const MEASURE_SEARCH_EXAMPLE = {
  fiscal_year: { min: 2026, max: 2026 },
  where: { jurisdiction_code: { eq: ['131091'] }, is_new: { eq: true } },
  order_by: [{ column: 'budget_yen', desc: true }],
  page_size: 50,
}

const MEASURES =
  'A measure is one item in a municipality\'s budget proposal press release (the year is the budget year), with its title, the project names printed with it (names, a JSON array as text), the "new" mark and the amount printed in the release. ' +
  'expenditure_detail_id links a measure to the initial-budget detail line it was matched to (Fudoki\'s judgment; link_method and link_confidence say how); budget_yen is the release\'s own figure and is never added to expenditure lines. '

const searchMeasuresDescription =
  'Search budget proposal measures. ' +
  MEASURES +
  `Required: fiscal_year {min, max} in Gregorian years (at most ${MAX_YEARS} years). ` +
  `where takes one condition per column, combined with AND: strings eq/not_eq (up to ${MAX_LIST} values), prefix/suffix/contains, is_null; integers eq/not_eq/min/max/is_null; numbers min/max/is_null; booleans eq. Years plus condition values are limited to ${MAX_BINDS}.`

const getDescription = 'Return one budget proposal (a municipality and budget year) by budget_proposal_id, with all its measures and the press release documents. ' + MEASURES

export const budgetProposalTools = {
  get: {
    name: 'get_budget_proposal',
    title: 'Budget proposal with its measures',
    description: getDescription,
    input: z.strictObject({ budget_proposal_id: BudgetProposalId }),
    output: BudgetProposalOutput,
    run: (ctx, input) => getBudgetProposal(ctx, input as { budget_proposal_id: string }),
  },
  searchMeasures: {
    name: 'search_budget_measures',
    title: 'Search budget proposal measures',
    description: searchMeasuresDescription,
    input: MeasureSearchInput,
    output: MeasureSearchOutput,
    run: (ctx, input) => searchMeasures(ctx, input as SearchInput),
  },
} satisfies Record<string, Tool>
