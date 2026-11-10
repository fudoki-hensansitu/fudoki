// 事業の集約（docs/prd/jurisdiction-page-data/project-domain-model.md）: 予算書の事業の行を1つずつ事業にし、年度をまたいでつないだ木。
// 守ること: 1つの年度に事業の金額は1つ。1つの内訳は高々1つの事業の年度に入る。金額は事業の木で足さず、資料ごとに末端の内訳を足す。
import { z } from 'zod'
import { FiscalYear, JurisdictionCode } from '../shared/model'

/** 始めた年度。収録の範囲でしか決まらない */
export const ProjectStart = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('confirmed'), fiscal_year: FiscalYear.describe('前の年度の資料があり、そこに無かった') }),
  z.strictObject({ kind: z.literal('before_coverage'), first_seen: FiscalYear.describe('収録の最初の年度') }),
])

/** 終えた年度 */
export const ProjectEnd = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('confirmed'), last_year: FiscalYear.describe('次の年度の資料があり、そこに無かった') }),
  z.strictObject({ kind: z.literal('latest') }),
  z.strictObject({ kind: z.literal('unknown'), last_seen: FiscalYear.describe('次の年度の資料（その会計）が収録に無い') }),
])

/** 歳出の行の参照。事業の内訳が無い自治体は目（目の無い項を含む）を指す */
export const LineRef = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('detail'), detail_id: z.string() }),
  z.strictObject({ kind: z.literal('moku'), subject_id: z.string() }),
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
