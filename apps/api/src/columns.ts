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
  /** dbt の accepted_values。model.ts の enum と同じ値（model.test.ts が照合する） */
  values?: (string | number)[]
}

interface TableSpec {
  primary_key: string
  columns: ColumnSpec[]
}

export const TABLES = (columnsJson as unknown as { tables: Record<string, TableSpec> }).tables

const selectList = (columns: ColumnSpec[]) => columns.map((c) => `"${c.name}"`).join(', ')

/** 資料区分。科目・内訳の表の列で、検索は必ず一つに絞る（意味の違う金額を一つの応答に混ぜない） */
export const DOCUMENT_KINDS = ['settlement', 'initial'] as const

/** 検索の対象の表（歳出の科目・内訳、事業評価のシート、予算案の施策） */
export interface FiscalTable {
  /** 操作名に使う複数形（page_token の指紋に入れる） */
  kind: 'subjects' | 'details' | 'evaluation_sheets' | 'budget_measures'
  table: string
  primaryKey: string
  /** document_kind の列があり、検索で必ず1つに絞る表か */
  hasDocumentKind: boolean
  columns: ColumnSpec[]
  types: ReadonlyMap<string, ColumnType>
  selectList: string
}

const fiscalTable = (kind: FiscalTable['kind'], table: string): FiscalTable => {
  const t = TABLES[table]!
  return {
    kind,
    table,
    primaryKey: t.primary_key,
    hasDocumentKind: t.columns.some((c) => c.name === 'document_kind'),
    columns: t.columns,
    types: new Map(t.columns.map((c) => [c.name, c.type])),
    selectList: selectList(t.columns),
  }
}

/** 款・項・目。同じ資料・会計の款の和が総額（目・is_leaf の和は出典しだいで小さくなる） */
export const SUBJECT_TABLE = fiscalTable('subjects', 'expenditure_subject')
/** 科目の下の内訳。同じ科目・同じ breakdown の depth = 1 の和が科目の額 */
export const DETAIL_TABLE = fiscalTable('details', 'expenditure_detail')

/** 科目・内訳の行が印字された位置（row_id は subject_id か detail_id） */
export const LOCATION_TABLE = 'expenditure_location'
export const LOCATION_COLUMNS = TABLES[LOCATION_TABLE]!.columns
export const LOCATION_SELECT_LIST = selectList(LOCATION_COLUMNS)

export const ORIGIN_TABLE = 'expenditure_origin'
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

/** 歳出の根。科目・内訳の表に行がある自治体・年度・資料区分・会計。出典（冊）とは結ぶ表で組になる */
export const COVERAGE_TABLE = 'expenditure'
export const COVERAGE_COLUMNS = TABLES[COVERAGE_TABLE]!.columns
export const ORIGIN_LINK_TABLE = 'expenditure_origin_link'

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

/** 表の列をすべて引く SELECT の列の並び */
export const selectListOf = (table: string) => selectList(TABLES[table]!.columns)
export const columnsOf = (table: string) => TABLES[table]!.columns

/** 事業評価の根（自治体 × 評価した事業を行った年度）と予算案の根（自治体 × 予算の年度） */
export const EVALUATION_TABLE = 'evaluation'
export const EVALUATION_ORIGIN_TABLE = 'evaluation_origin'
export const EVALUATION_INDICATOR_TABLE = 'evaluation_indicator'
export const EVALUATION_INDICATOR_VALUE_TABLE = 'evaluation_indicator_value'
/** 評価シート。1枚 = 小事業の1年度 */
export const EVALUATION_SHEET_TABLE = fiscalTable('evaluation_sheets', 'evaluation_sheet')
export const BUDGET_PROPOSAL_TABLE = 'budget_proposal'
export const BUDGET_PROPOSAL_ORIGIN_TABLE = 'budget_proposal_origin'
/** 予算案の施策。資料の1件 */
export const BUDGET_MEASURE_TABLE = fiscalTable('budget_measures', 'budget_measure')

/**
 * 手で書いた行の schema の各列に、columns.json（dbt の _models.yml）の説明を付ける。
 * 列の集合・型・null の可否・accepted_values が columns.json と合うかは model.test.ts が照合する。
 */
export function described<T extends z.ZodRawShape>(table: string, shape: T): T {
  const columns = TABLES[table]!.columns
  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [name, (schema as z.ZodType).describe(columns.find((c) => c.name === name)?.description ?? '')])
  ) as unknown as T
}
