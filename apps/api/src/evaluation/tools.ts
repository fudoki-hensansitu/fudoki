// 事業評価の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import { z } from 'zod'
import { pageSize, pageTokenOf } from '../shared/paging'
import { MAX_BINDS, MAX_LIST, MAX_YEARS, type SearchInput } from '../shared/search'
import type { Tool } from '../shared/tool'
import { EvaluationId, EvaluationOutput, SheetId, SheetOutput, SheetSearchInput, SheetSearchOutput } from './model'
import { getEvaluation, getSheet, searchSheets, type EvaluationInput } from './queries'

export const SHEET_SEARCH_EXAMPLE = {
  fiscal_year: { min: 2024, max: 2024 },
  where: { jurisdiction_code: { eq: ['131091'] }, name: { contains: '子ども' } },
  order_by: [{ column: 'settled_yen', desc: true }],
  page_size: 50,
}

const GRADES =
  'Each sheet is one project (a small project in Shinagawa) in one fiscal year (the year the project ran). grade_label and direction are printed on the sheet; grade_code maps grade_label to A (expand) / B (continue) / C (review) / D (end), and is null when the sheet has no grade or the label does not map. direction_code maps the printed direction (or the grade label where the sheet prints the direction as its grade) to a shared code such as expand, keep, improve, reduce, complete or end. ' +
  'Grades are the municipality\'s own self-evaluation; report them as printed and do not rank projects or municipalities by them. '

const searchSheetsDescription =
  'Search project evaluation sheets (事務事業評価). ' +
  GRADES +
  `Required: fiscal_year {min, max} in Gregorian years (at most ${MAX_YEARS} years). ` +
  `where takes one condition per column, combined with AND: strings eq/not_eq (up to ${MAX_LIST} values), prefix/suffix/contains, is_null; integers eq/not_eq/min/max/is_null. Years plus condition values are limited to ${MAX_BINDS}. ` +
  'Narrow by jurisdiction_code when searching names. expenditure_detail_id and expenditure_subject_id link a sheet to the settlement line it was matched to (Fudoki\'s judgment); budget_yen and settled_yen are the sheet\'s own amounts and are never added to expenditure lines. ' +
  'Use get_evaluation_sheet for indicators.'

const getEvaluationDescription =
  'Return one project evaluation year of a municipality by evaluation_id: the result document counts when published (kind "with_result": evaluated_count and grade_a–grade_d as printed), the sources, and the evaluation sheets (paged with page_size and page_token). ' +
  GRADES +
  'The number of sheets matches evaluated_count only when every sheet was ingested.'

const getSheetDescription =
  'Return one evaluation sheet by sheet_id with its indicators and the target and actual value per fiscal year, as printed on the sheet (text, not numbers). ' + GRADES

export const evaluationTools = {
  get: {
    name: 'get_evaluation',
    title: 'Project evaluation year',
    description: getEvaluationDescription,
    input: z.strictObject({ evaluation_id: EvaluationId, page_size: pageSize(), page_token: pageTokenOf('evaluation_id') }),
    output: EvaluationOutput,
    run: (ctx, input) => getEvaluation(ctx, input as unknown as EvaluationInput),
  },
  getSheet: {
    name: 'get_evaluation_sheet',
    title: 'Project evaluation sheet',
    description: getSheetDescription,
    input: z.strictObject({ sheet_id: SheetId }),
    output: SheetOutput,
    run: (ctx, input) => getSheet(ctx, input as { sheet_id: string }),
  },
  searchSheets: {
    name: 'search_evaluation_sheets',
    title: 'Search project evaluation sheets',
    description: searchSheetsDescription,
    input: SheetSearchInput,
    output: SheetSearchOutput,
    run: (ctx, input) => searchSheets(ctx, input as SearchInput),
  },
} satisfies Record<string, Tool>
