// 事業の集約（docs/prd/jurisdiction-page-data/project-domain-model.md）: 予算書の事業の行を1つずつ事業にし、年度をまたいでつないだ木。
// 守ること: 1つの年度に事業の金額は1つ。1つの内訳は高々1つの事業の年度に入る。金額は事業の木で足さず、資料ごとに末端の内訳を足す。
import { z } from 'zod'
import { described, PROJECT_YEAR_TABLE } from '../columns'
import { FiscalYear, JurisdictionCode, RowId } from '../shared/model'
import { nextPageToken } from '../shared/paging'
import { yearSearchInputFor } from '../shared/search'

/** 始めた年度。収録の範囲でしか決まらない */
export const ProjectStart = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('confirmed'), fiscal_year: FiscalYear.describe('前の年度の資料があり、そこに無かった') }),
  z.strictObject({ kind: z.literal('before_coverage'), first_seen: FiscalYear.describe('前の年度の資料が無く、それより前は分からない') }),
])

/** 終えた年度 */
export const ProjectEnd = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('confirmed'), last_year: FiscalYear.describe('次の年度の資料があり、そこに無かった') }),
  z.strictObject({ kind: z.literal('latest') }),
  z.strictObject({ kind: z.literal('unknown'), last_seen: FiscalYear.describe('次の年度の資料（その会計）が収録に無い') }),
])

/** 歳出の行の参照。事業の内訳が無い自治体は目（目の無い項を含む）を指す */
export const LineRef = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('detail'), expenditure_detail_id: z.string() }),
  z.strictObject({ kind: z.literal('moku'), expenditure_subject_id: z.string() }),
])

const yearCommon = { project_year_id: z.string(), fiscal_year: FiscalYear }

/** 事業の金額（事業の1年度）。当初予算と決算の少なくとも一方の行を持つ */
export const ProjectYear = z.discriminatedUnion('kind', [
  z.strictObject({ ...yearCommon, kind: z.literal('both'), initial: LineRef, settlement: LineRef }),
  z.strictObject({ ...yearCommon, kind: z.literal('initial'), initial: LineRef }),
  z.strictObject({ ...yearCommon, kind: z.literal('settlement'), settlement: LineRef }),
])

export const Project = z.strictObject({
  project_id: z.string().describe('代理キー。一度振ったら変えない'),
  jurisdiction_code: JurisdictionCode,
  name: z.string().describe('最新の年度の表記'),
  start: ProjectStart,
  end: ProjectEnd,
  parent_project_id: z.string().nullable().describe('予算書の入れ子の1つ上の事業。目の直下の事業は持たない'),
  years: z.array(ProjectYear).min(1),
})
export type Project = z.infer<typeof Project>

// API の行。列は表（columns.json）のまま。列の集合・型・null の可否・accepted_values は model.test.ts が照合する。

export const ProjectRow = z
  .strictObject(
    described('project', {
      project_id: z.string(),
      jurisdiction_code: z.string(),
      name: z.string(),
      account_name: z.string(),
      first_year: z.int(),
      first_year_kind: z.enum(['confirmed', 'before_coverage']),
      last_year: z.int().nullable(),
      last_year_kind: z.enum(['confirmed', 'latest', 'unknown']),
      parent_project_id: z.string().nullable(),
    })
  )
  .meta({ id: 'ProjectRow', description: '事業（予算書・決算書の事業の行を年度をまたいでつないだもの。つなぎ方は風土記の判断）。' })

export const ProjectYearRow = z
  .strictObject(
    described('project_year', {
      project_year_id: z.string(),
      project_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
      name: z.string(),
      account_name: z.string(),
      kan_name: z.string().nullable(),
      kou_name: z.string().nullable(),
      moku_name: z.string().nullable(),
      initial_expenditure_detail_id: z.string().nullable(),
      settlement_expenditure_detail_id: z.string().nullable(),
      budget_yen: z.int().nullable(),
      settled_yen: z.int().nullable(),
    })
  )
  .meta({ id: 'ProjectYearRow', description: '事業の1年度（当初予算と決算の事業の行）。' })

/** 1つの事業の直下の事業の上限 */
export const MAX_CHILDREN = 500

export const ProjectId = RowId('project_id from search_projects or a parent_project_id')

export const ProjectOutput = z.strictObject({
  project: ProjectRow,
  years: z.array(ProjectYearRow).describe('事業の年度（年度の順）。'),
  children: z.array(ProjectRow).describe(`直下の事業（予算書の入れ子の1つ下）。${MAX_CHILDREN} 件まで。`),
})
export type ProjectOutput = z.infer<typeof ProjectOutput>

export const ProjectSearchInput = yearSearchInputFor(PROJECT_YEAR_TABLE)
export const ProjectSearchOutput = z.strictObject({
  project_years: z.array(ProjectYearRow),
  projects: z.array(ProjectRow).describe('この頁の事業の年度が属する事業（始めた年度・終えた年度）。'),
  next_page_token: nextPageToken,
})
export type ProjectSearchOutput = z.infer<typeof ProjectSearchOutput>
