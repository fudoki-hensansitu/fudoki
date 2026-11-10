// 事業の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import { z } from 'zod'
import { MAX_BINDS, MAX_LIST, MAX_YEARS, type SearchInput } from '../shared/search'
import type { Tool } from '../shared/tool'
import { ProjectId, ProjectOutput, ProjectSearchInput, ProjectSearchOutput } from './model'
import { getProject, searchProjects } from './queries'

export const PROJECT_SEARCH_EXAMPLE = {
  fiscal_year: { min: 2026, max: 2026 },
  where: { jurisdiction_code: { eq: ['131091'] }, name: { contains: '子ども' } },
  order_by: [{ column: 'budget_yen', desc: true }],
  page_size: 50,
}

const PROJECTS =
  'A project is a budget-book project line followed across fiscal years; which lines continue the same project is Fudoki\'s judgment. ' +
  'Each project year holds the initial-budget line (budget_detail_id, budget_yen) and the settlement line (settlement_detail_id, settled_yen) of that year, either may be null. ' +
  'Projects nest like the budget book (parent_project_id): a child project\'s amount is included in its parent\'s, so never add projects together; open the lines with get_expenditure_line for sources. '

const searchDescription =
  'Search project years (one row per project and fiscal year). ' +
  PROJECTS +
  `Required: fiscal_year {min, max} in Gregorian years (at most ${MAX_YEARS} years). ` +
  `where takes one condition per column, combined with AND: strings eq/not_eq (up to ${MAX_LIST} values), prefix/suffix/contains, is_null; integers eq/not_eq/min/max/is_null. Years plus condition values are limited to ${MAX_BINDS}.`

const getDescription =
  'Return one project by project_id: its years and child projects. ' +
  'Evaluation sheets and budget proposal measures are not included: find them with search_evaluation_sheets (where detail_id eq the years\' settlement_detail_id) and search_budget_measures (where detail_id eq the years\' budget_detail_id); skip a search when the years have no such ids. ' +
  'first_year_kind before_coverage means the previous year is not covered, so the project may be older; last_year_kind latest means it is in the latest covered year, unknown means the next year is not covered. ' +
  PROJECTS

export const projectTools = {
  get: {
    name: 'get_project',
    title: 'Project across fiscal years',
    description: getDescription,
    input: z.strictObject({ project_id: ProjectId }),
    output: ProjectOutput,
    run: (ctx, input) => getProject(ctx, input as { project_id: string }),
  },
  search: {
    name: 'search_projects',
    title: 'Search projects',
    description: searchDescription,
    input: ProjectSearchInput,
    output: ProjectSearchOutput,
    run: (ctx, input) => searchProjects(ctx, input as SearchInput),
  },
} satisfies Record<string, Tool>
