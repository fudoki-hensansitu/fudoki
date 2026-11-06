import { z } from 'zod'
import columnsJson from './columns.json'

export type ColumnType = 'string' | 'integer' | 'number' | 'boolean'

// columns.json は pipeline/serving の生成物（D1 の表と列の契約）。手で編集しない。
// 表は marts と同名（docs/prd/fiscal-serving-tables/dd.md）。
export interface ColumnSpec {
  name: string
  type: ColumnType
  description: string | null
  /** 欠けているときは null になり得るものとして扱う */
  nullable?: boolean
}

interface TableSpec {
  primary_key: string
  columns: ColumnSpec[]
}

const TABLES = (columnsJson as unknown as { tables: Record<string, TableSpec> }).tables

const selectList = (columns: ColumnSpec[]) => columns.map((c) => `"${c.name}"`).join(', ')

/** 資料区分。科目・内訳の表の列で、検索は必ず一つに絞る（意味の違う金額を一つの応答に混ぜない） */
export const DOCUMENT_KINDS = ['settlement', 'initial'] as const

/** 歳出の科目の表・内訳の表。検索と取得の対象 */
export interface FiscalTable {
  /** 操作名に使う複数形（subjects・details） */
  kind: 'subjects' | 'details'
  table: string
  primaryKey: string
  parentKey: string
  columns: ColumnSpec[]
  types: ReadonlyMap<string, ColumnType>
  selectList: string
}

const fiscalTable = (kind: FiscalTable['kind'], table: string, parentKey: string): FiscalTable => {
  const t = TABLES[table]!
  return {
    kind,
    table,
    primaryKey: t.primary_key,
    parentKey,
    columns: t.columns,
    types: new Map(t.columns.map((c) => [c.name, c.type])),
    selectList: selectList(t.columns),
  }
}

/** 款・項・目。同じ資料で level を一つに絞るか is_leaf の行を足すと総額 */
export const SUBJECT_TABLE = fiscalTable('subjects', 'fiscal_expenditure_subject', 'parent_subject_id')
/** 科目の下の内訳。同じ科目・同じ breakdown の depth = 1 の和が科目の額 */
export const DETAIL_TABLE = fiscalTable('details', 'fiscal_expenditure_detail', 'parent_detail_id')

/** 科目・内訳の行が印字された位置（row_id は subject_id か detail_id） */
export const LOCATION_TABLE = 'fiscal_expenditure_location'
export const LOCATION_COLUMNS = TABLES[LOCATION_TABLE]!.columns
export const LOCATION_SELECT_LIST = selectList(LOCATION_COLUMNS)

export const ORIGIN_TABLE = 'fiscal_origin'
export const ORIGIN_COLUMNS = TABLES[ORIGIN_TABLE]!.columns
export const ORIGIN_SELECT_LIST = selectList(ORIGIN_COLUMNS)

/** 自治体マスタ。収録の無い自治体も含む全自治体 */
export const JURISDICTION_TABLE = 'jurisdiction'
export const JURISDICTION_COLUMNS = TABLES[JURISDICTION_TABLE]!.columns
export const JURISDICTION_SELECT_LIST = selectList(JURISDICTION_COLUMNS)

/** 住民基本台帳人口。自治体マスタの自治体ごと・資料（基準日）ごとに1行 */
export const POPULATION_TABLE = 'population'
export const POPULATION_COLUMNS = TABLES[POPULATION_TABLE]!.columns
export const POPULATION_ORIGIN_TABLE = 'population_origin'
export const POPULATION_ORIGIN_COLUMNS = TABLES[POPULATION_ORIGIN_TABLE]!.columns

/** 収録範囲。科目・内訳の表に行がある自治体・年度・資料区分・会計と出典の組 */
export const COVERAGE_TABLE = 'fiscal_coverage'
export const COVERAGE_COLUMNS = TABLES[COVERAGE_TABLE]!.columns

export const DOCUMENT_KIND_DESCRIPTION =
  'Document kind: settlement means executed expenditure; initial means initial budget amounts. Do not add amounts with different meanings.'

export type Row = Record<string, string | number | boolean | null>

/** D1 の行を公開の形にする。boolean 列は 0/1 を true/false に戻す。 */
export function toRow(columns: ColumnSpec[], raw: Record<string, unknown>): Row {
  const row: Row = {}
  for (const c of columns) {
    const v = raw[c.name] ?? null
    row[c.name] = c.type === 'boolean' && v !== null ? v === 1 || v === true : (v as string | number | null)
  }
  return row
}

export const zodOf = (type: ColumnType) =>
  type === 'string' ? z.string() : type === 'boolean' ? z.boolean() : z.number()

/** nullable が false の列だけ非 null にする（OpenAPI の契約を締める）。 */
export const nullableIf = (schema: z.ZodType, c: ColumnSpec) => (c.nullable === false ? schema : schema.nullable())
