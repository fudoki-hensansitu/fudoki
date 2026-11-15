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

/** 検索の対象の表（歳出の科目・内訳、事業評価のシート、事業の年度） */
export interface FiscalTable {
  /** 操作名に使う複数形（page_token の指紋に入れる） */
  kind: 'subjects' | 'details' | 'evaluation_sheets' | 'project_years'
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

/** 科目・内訳の行が印字された位置（line_id は subject_id か detail_id） */
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
export const EVALUATION_SHEET_PROJECT_TABLE = 'evaluation_sheet_project'
export const PROJECT_TABLE = 'project'
const PROJECT_YEAR_BASE = 'project_year'

// 事業・事業の年度の表は外部キーだけを持ち、名前・会計・款項目・科目・金額は指した内訳（expenditure_detail）から、
// 自治体は事業から JOIN で引く（表どうしで値を写さない）。API の行は JOIN した後の形で、引いた列の説明はここに書く。
const joined = (name: string, type: ColumnType, description: string, nullable = true): ColumnSpec => ({ name, type, description, nullable })

/** 事業の年度の行に JOIN で足す列 */
const PROJECT_YEAR_JOINED: ColumnSpec[] = [
  joined('jurisdiction_code', 'string', '全国地方公共団体コード（6桁）。事業（project）から引く。', false),
  joined('name', 'string', 'この年度の事業の名前（当初予算の表記を優先）。指した内訳の名前。', false),
  joined('account_name', 'string', '会計の名前。指した内訳の会計。', false),
  joined('kan_name', 'string', '款の名前。'),
  joined('kou_name', 'string', '項の名前。'),
  joined('moku_name', 'string', '目の名前。目の無い項の下の事業は NULL。'),
  joined('initial_expenditure_subject_id', 'string', '当初予算書の事業の行が載る科目（目。目の無い項の下は項）。expenditure_subject の subject_id。当初予算に無い年度は NULL。科目の分野（COFOG）はこの ID で科目から引く。'),
  joined('settlement_expenditure_subject_id', 'string', '決算書の事業の行が載る科目（目。目の無い項の下は項）。expenditure_subject の subject_id。決算に無い年度は NULL。'),
  joined('budget_yen', 'integer', '当初予算額（円）。当初予算書の事業の行の金額。'),
  joined('settled_yen', 'integer', '支出済額（円）。決算書の事業の行の金額。'),
]

/** 事業の行に JOIN で足す列（最新の年度の行から引く） */
const PROJECT_JOINED: ColumnSpec[] = [
  joined('name', 'string', '最新の年度の事業の名前（当初予算の表記を優先。所管課の【】・[] を含む出典の表記のまま）。', false),
  joined('account_name', 'string', '最新の年度の会計の名前。', false),
]

const columnOf = (table: string, name: string) => TABLES[table]!.columns.find((c) => c.name === name)!
const ordered = (table: string, joinedCols: ColumnSpec[], order: string[]) =>
  order.map((n) => joinedCols.find((c) => c.name === n) ?? columnOf(table, n))

/** 事業の年度の行の列（表の列と JOIN で引く列） */
export const PROJECT_YEAR_COLUMNS = ordered(PROJECT_YEAR_BASE, PROJECT_YEAR_JOINED, [
  'project_year_id', 'project_id', 'jurisdiction_code', 'fiscal_year', 'name', 'account_name', 'kan_name', 'kou_name', 'moku_name',
  'initial_expenditure_detail_id', 'settlement_expenditure_detail_id', 'initial_expenditure_subject_id', 'settlement_expenditure_subject_id',
  'budget_yen', 'settled_yen',
])
/** 事業の行の列（表の列と JOIN で引く列） */
export const PROJECT_COLUMNS = ordered(PROJECT_TABLE, PROJECT_JOINED, [
  'project_id', 'jurisdiction_code', 'name', 'account_name', 'first_year', 'first_year_kind', 'last_year', 'last_year_kind', 'parent_project_id',
])

/** 事業の年度を事業の列（始め・終え・親）でも絞るための列。値は project にだけあり、検索の中で JOIN して引く（同じ事業の集約の中） */
export const PROJECT_FILTER_COLUMNS = ['first_year', 'first_year_kind', 'last_year', 'last_year_kind', 'parent_project_id'] as const

/** 事業の年度の行を組む SELECT（y が事業の年度、p が事業、i・s が当初予算・決算の内訳）。extra は足す列 */
// 結び方は2つ。既定は事業 p を外側に固定する（CROSS JOIN）。自由にすると SQLite（D1 は統計を持たない）は年度の索引で全自治体の
// その年度の事業の年度を先に読み、自治体の条件を後から当てるので、1自治体の検索が全国分を読む（2026-11-15 に D1 が overloaded になった）。
// p を先にすると、自治体・親・事業の ID の索引で事業を絞り、事業の年度は (project_id, fiscal_year) の索引で引く。
// 事業の年度の ID・内訳の ID で絞るときだけは p を先にすると全国の事業をなめるので、y を外側にし、年度の索引は使わせない（+）
type ProjectYearJoin = 'project-first' | 'year-first'
const projectYearSelect = (extra = '', join: ProjectYearJoin = 'project-first') => `SELECT y."project_year_id", p."project_id", p."jurisdiction_code", ${join === 'year-first' ? '+' : ''}y."fiscal_year" AS "fiscal_year",
  COALESCE(i."name", s."name") AS "name", COALESCE(i."account_name", s."account_name") AS "account_name",
  COALESCE(i."kan_name", s."kan_name") AS "kan_name", COALESCE(i."kou_name", s."kou_name") AS "kou_name", COALESCE(i."moku_name", s."moku_name") AS "moku_name",
  y."initial_expenditure_detail_id", y."settlement_expenditure_detail_id",
  i."subject_id" AS "initial_expenditure_subject_id", s."subject_id" AS "settlement_expenditure_subject_id",
  i."amount_yen" AS "budget_yen", s."amount_yen" AS "settled_yen"${extra}
FROM ${join === 'year-first' ? `${PROJECT_YEAR_BASE} y CROSS JOIN ${PROJECT_TABLE} p` : `${PROJECT_TABLE} p CROSS JOIN ${PROJECT_YEAR_BASE} y`} ON y."project_id" = p."project_id"
LEFT JOIN ${DETAIL_TABLE.table} i ON i."detail_id" = y."initial_expenditure_detail_id"
LEFT JOIN ${DETAIL_TABLE.table} s ON s."detail_id" = y."settlement_expenditure_detail_id"`

const viewOf = (kind: FiscalTable['kind'], table: string, primaryKey: string, columns: ColumnSpec[]): FiscalTable => ({
  kind,
  table,
  primaryKey,
  hasDocumentKind: false,
  columns,
  types: new Map(columns.map((c) => [c.name, c.type])),
  selectList: selectList(columns),
})

/** 事業の年度（JOIN した後の行）。FROM に置く副問い合わせ */
export const PROJECT_YEAR_TABLE = viewOf('project_years', `(${projectYearSelect()})`, TABLES[PROJECT_YEAR_BASE]!.primary_key, PROJECT_YEAR_COLUMNS)

const projectYearSearch = (join: ProjectYearJoin): FiscalTable => {
  const extra = PROJECT_FILTER_COLUMNS.map((n) => columnOf(PROJECT_TABLE, n))
  const columns = [...PROJECT_YEAR_COLUMNS, ...extra]
  return viewOf('project_years', `(${projectYearSelect(PROJECT_FILTER_COLUMNS.map((n) => `, p."${n}"`).join(''), join)})`, TABLES[PROJECT_YEAR_BASE]!.primary_key, columns)
}

/** 事業の年度の検索の対象。行は事業の年度の列だけを返し、条件には事業の列も使える */
export const PROJECT_YEAR_SEARCH = projectYearSearch('project-first')
/** 事業の年度の ID・内訳の ID で絞る検索の対象（事業の年度を外側にする）。列は PROJECT_YEAR_SEARCH と同じ */
export const PROJECT_YEAR_SEARCH_BY_YEAR_KEY = projectYearSearch('year-first')
/** 事業の年度の表の索引で引ける列。where にこの列の eq があれば PROJECT_YEAR_SEARCH_BY_YEAR_KEY で探す */
export const PROJECT_YEAR_KEY_COLUMNS = ['project_year_id', 'initial_expenditure_detail_id', 'settlement_expenditure_detail_id'] as const

/** 事業の名前・会計を引く、最新の年度の行（事業 p の副問い合わせ） */
const latestOf = (expr: string) => `(SELECT ${expr} FROM ${PROJECT_YEAR_BASE} y
  LEFT JOIN ${DETAIL_TABLE.table} i ON i."detail_id" = y."initial_expenditure_detail_id"
  LEFT JOIN ${DETAIL_TABLE.table} s ON s."detail_id" = y."settlement_expenditure_detail_id"
  WHERE y."project_id" = p."project_id" ORDER BY y."fiscal_year" DESC LIMIT 1)`

/** 事業（JOIN した後の行）。FROM に置く副問い合わせ */
export const PROJECT_VIEW = `(SELECT p."project_id", p."jurisdiction_code",
  ${latestOf('COALESCE(i."name", s."name")')} AS "name", ${latestOf('COALESCE(i."account_name", s."account_name")')} AS "account_name",
  p."first_year", p."first_year_kind", p."last_year", p."last_year_kind", p."parent_project_id"
FROM ${PROJECT_TABLE} p)`
export const PROJECT_SELECT_LIST = selectList(PROJECT_COLUMNS)

/**
 * 手で書いた行の schema の各列に、columns.json（dbt の _models.yml）の説明を付ける。
 * 列の集合・型・null の可否・accepted_values が columns.json と合うかは model.test.ts が照合する。
 */
export function described<T extends z.ZodRawShape>(table: string | ColumnSpec[], shape: T): T {
  const columns = typeof table === 'string' ? TABLES[table]!.columns : table
  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [name, (schema as z.ZodType).describe(columns.find((c) => c.name === name)?.description ?? '')])
  ) as unknown as T
}
