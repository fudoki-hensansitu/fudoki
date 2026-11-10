// 歳出の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import { MAX_BINDS, MAX_LIST, MAX_YEARS, type SearchInput } from '../shared/search'
import { pageSize, pageTokenOf } from '../shared/paging'
import type { Tool } from '../shared/tool'
import { z } from 'zod'
import { DetailSearchInput, DetailSearchOutput, LineId, LineOutput, SubjectSearchInput, SubjectSearchOutput } from './model'
import { getLine, searchDetails, searchSubjects, type LineInput } from './queries'

export const SUBJECT_SEARCH_EXAMPLE = {
  document_kind: 'settlement',
  fiscal_year: { min: 2025, max: 2025 },
  where: { level: { eq: ['目'] }, cofog_code: { prefix: '10.4' } },
  order_by: [{ column: 'amount_yen', desc: true }],
  page_size: 50,
}

export const DETAIL_SEARCH_EXAMPLE = {
  document_kind: 'settlement',
  fiscal_year: { min: 2025, max: 2025 },
  where: { jurisdiction_code: { eq: ['131091'] }, breakdown: { eq: ['事業'] }, depth: { eq: [1] }, name: { contains: '子ども' } },
  order_by: [{ column: 'amount_yen', desc: true }],
  page_size: 50,
}

const INPUT_HELP =
  `Required: document_kind ("settlement" = executed amounts, "initial" = initial budget; never add the two) and fiscal_year {min, max} in Gregorian years (at most ${MAX_YEARS} years). ` +
  `where takes one condition per column, combined with AND: strings eq/not_eq (up to ${MAX_LIST} values, eq is OR), prefix/suffix/contains, is_null; integers eq/not_eq/min/max/is_null; numbers min/max/is_null; booleans eq. ` +
  `There is no cross-column OR or NOT; run separate queries. Years plus condition values are limited to ${MAX_BINDS} in total. Column meanings are in the output schema descriptions.`

const searchSubjectsDescription =
  'Search expenditure subjects: 款/kan, 項/kou and 目/moku printed in budget and settlement documents (level column). ' +
  'For comparisons across municipalities or years, filter level to "目" (or use cofog_code), then use get_expenditure_line to see child subjects and the details below a 目. ' +
  'Text filters match printed names (name, kan_name, kou_name, moku_name). ' +
  INPUT_HELP +
  ' Adding amounts: rows with level "款" of one municipality, year, document kind and account add up to total expenditure. Filtering to one level, or to is_leaf = true (目 and 項 without 目), usually gives the same total but can be smaller where the source prints children short of their parent; do not fill that gap with detail amounts, and never mix parents and children. ' +
  'To compare by COFOG, add 目 rows by cofog_code prefix; an assigned 目 has exactly one code. A 目 with only a division code (e.g. "10") belongs to no group, so do not include it in "10.2*". ' +
  'The sum of all COFOG divisions plus 目 with cofog_status unclassifiable or out-of-scope equals total expenditure.'

const searchDetailsDescription =
  'Search expenditure details: items printed below a subject (mostly 目), such as projects (breakdown "事業"), statutory setsu (breakdown "節") or other source breakdowns ("その他"). ' +
  'Filter breakdown "事業" with depth 1 to list projects of a 目; department holds the responsible division printed at the end of the name. ' +
  'Narrative body text is not in these tables; if a project name is not printed, search the subject names instead. Narrow by jurisdiction_code when searching names to keep scans small. ' +
  INPUT_HELP +
  ' Adding amounts: rows with the same subject_id, the same breakdown and depth 1 add up to the subject amount (not when the source omits an amount). Never mix breakdowns or depths: 事業 and 節 split the same spending in different ways. Use get_expenditure_line to see deeper items.'

const getLineDescription =
  'Return one expenditure line by id: a subject (款/項/目, kind "subject") or a detail (kind "detail"), with print locations and sources. ' +
  'For a subject, also return its child subjects and the details directly below it (depth 1); for a detail, its child details. Details are grouped by breakdown (事業・節・その他) and paged with page_size and page_token. Sum details only within one breakdown.'

export const LineInputSchema = z.strictObject({
  line_id: LineId,
  page_size: pageSize(),
  page_token: pageTokenOf('line_id'),
})

export const expenditureTools = {
  searchSubjects: {
    name: 'search_expenditure_subjects',
    title: 'Search expenditure subjects (kan, kou, moku)',
    description: searchSubjectsDescription,
    input: SubjectSearchInput,
    output: SubjectSearchOutput,
    view: true,
    run: (ctx, input) => searchSubjects(ctx, input as SearchInput),
  },
  searchDetails: {
    name: 'search_expenditure_details',
    title: 'Search expenditure details (projects, setsu)',
    description: searchDetailsDescription,
    input: DetailSearchInput,
    output: DetailSearchOutput,
    view: true,
    run: (ctx, input) => searchDetails(ctx, input as SearchInput),
  },
  getLine: {
    name: 'get_expenditure_line',
    title: 'Expenditure line with its children',
    description: getLineDescription,
    input: LineInputSchema,
    output: LineOutput,
    view: true,
    run: (ctx, input) => getLine(ctx, input as unknown as LineInput),
  },
} satisfies Record<string, Tool>
