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
  kind: 'subjects' | 'details' | 'evaluation_sheets' | 'budget_measures' | 'project_years'
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

// --- 歳出の科目・内訳の検索（ADR 0047） ---
// 科目・内訳の表は、根の値（自治体・年度・資料区分・会計）・所属する款・項・目・子の有無を持たない。
// 検索・取得の応答はこれらの列を含む平たい行のままにし、SQL の中で根・親・子を JOIN して求める。

const ROOT_COLUMNS = ['jurisdiction_code', 'fiscal_year', 'document_kind', 'amendment_number', 'account_name', 'account_kind'] as const

/** 表に無く、検索の中で求める列の型と説明 */
const DERIVED_COLUMNS: Record<string, ColumnSpec> = Object.fromEntries(
  (
    [
      ['amount_phase', 'string', '金額の段階（executed 決算・執行実績、approved 当初予算）。document_kind と1対1。', false, ['executed', 'approved']],
      ['kan_code', 'string', '所属する出典の款番号（款では自分）。科目の親を辿って求める。', false],
      ['kan_name', 'string', '所属する款の出典の名称（款では自分）。款の番号は自治体ごとに違うので、比較の絞り込みはこの列で行う。', false],
      ['kou_code', 'string', '所属する出典の項番号（項では自分）。款と、款の直下の目では NULL。', true],
      ['kou_name', 'string', '所属する項の出典の名称（項では自分）。款と、款の直下の目では NULL。', true],
      ['moku_code', 'string', '所属する出典の目番号（目では自分）。款・項では NULL。', true],
      ['moku_name', 'string', '所属する目の名称（目では自分）。款・項（内訳では項の直下の内訳）では NULL。', true],
    ] as const
  ).map(([name, type, description, nullable, values]) => [name, { name, type, description, nullable, ...(values ? { values: [...values] } : {}) }])
)
const SUBJECT_LEAF: ColumnSpec = {
  name: 'is_leaf',
  type: 'boolean',
  nullable: false,
  description:
    '科目の子を持たないか（目と、目の無い項）。同じ資料の is_leaf の行の和が歳出の総額。例外は神戸市の2025年度一般会計で、170,000円足りない（内訳の表の is_subject_remainder を見る）。',
}
const DETAIL_LEAF: ColumnSpec = { name: 'is_leaf', type: 'boolean', nullable: false, description: '内訳の子を持たないか。' }
const SUBJECT_REMAINDER: ColumnSpec = {
  name: 'is_subject_remainder',
  type: 'boolean',
  nullable: false,
  description:
    '末端でない科目（目を持つ項など）の直下の枝の根か。子の科目と並んで科目の額の一部を構成する（神戸市の福祉局の冊が目を立てずに印字した項の分、ADR 0030）。神戸市の2025年度一般会計は、科目の is_leaf の和にこの行を足しても款の和に 38,000円足りない（冊をまたいで足せない節がノードに無い）。depth = 1 の和の規則の外。',
}

/** 所属する款・項・目を、起点の科目 s・親 p・祖父母 g の段から求める式（目が款の直下にある資料がある） */
const pathExprs = (s: 'x' | 's') => ({
  kan_code: `CASE WHEN ${s}."level" = '款' THEN ${s}."code" WHEN p."level" = '款' THEN p."code" ELSE g."code" END`,
  kan_name: `CASE WHEN ${s}."level" = '款' THEN ${s}."name" WHEN p."level" = '款' THEN p."name" ELSE g."name" END`,
  kou_code: `CASE WHEN ${s}."level" = '項' THEN ${s}."code" WHEN p."level" = '項' THEN p."code" END`,
  kou_name: `CASE WHEN ${s}."level" = '項' THEN ${s}."name" WHEN p."level" = '項' THEN p."name" END`,
  moku_code: `CASE WHEN ${s}."level" = '目' THEN ${s}."code" END`,
  moku_name: `CASE WHEN ${s}."level" = '目' THEN ${s}."name" END`,
})

/** 列の並びと、それぞれを求める式から検索の対象を作る。表の列は表名の別名 x から引く */
function searchView(kind: FiscalTable['kind'], table: string, order: readonly string[], exprs: Record<string, string>, from: string, extra: Record<string, ColumnSpec>): FiscalTable {
  const own = TABLES[table]!
  const root = TABLES['expenditure']!.columns
  const specOf = (name: string): ColumnSpec =>
    extra[name] ?? DERIVED_COLUMNS[name] ?? own.columns.find((c) => c.name === name) ?? root.find((c) => c.name === name) ?? (() => { throw new Error(`${table}.${name} の列の定義が無い`) })()
  const columns = order.map(specOf)
  const exprOf = (name: string) =>
    exprs[name] ?? ((ROOT_COLUMNS as readonly string[]).includes(name) ? `e."${name}"` : own.columns.some((c) => c.name === name) ? `x."${name}"` : (() => { throw new Error(`${table}.${name} の式が無い`) })())
  return {
    kind,
    table: `(SELECT ${order.map((n) => `${exprOf(n)} AS "${n}"`).join(', ')} FROM ${from})`,
    primaryKey: own.primary_key,
    hasDocumentKind: true,
    columns,
    types: new Map(columns.map((c) => [c.name, c.type])),
    selectList: selectList(columns),
  }
}

const AMOUNT_PHASE = `CASE e."document_kind" WHEN 'settlement' THEN 'executed' ELSE 'approved' END`
/** 根 e と、所属の起点の科目 subject の親 p・祖父母 g の JOIN。科目の検索では表そのもの（x）が起点 */
const rootAndPath = (subject: 'x' | 's') =>
  `JOIN expenditure e ON e."expenditure_id" = x."expenditure_id" ` +
  `LEFT JOIN expenditure_subject p ON p."subject_id" = ${subject}."parent_subject_id" LEFT JOIN expenditure_subject g ON g."subject_id" = p."parent_subject_id"`

/** 款・項・目。同じ資料・会計の款の和が総額（目・is_leaf の和は出典しだいで小さくなる） */
export const SUBJECT_TABLE = searchView(
  'subjects',
  'expenditure_subject',
  ['subject_id', 'node_key', 'parent_subject_id', 'expenditure_id', ...ROOT_COLUMNS.slice(0, 4), 'amount_phase', ...ROOT_COLUMNS.slice(4), 'level', 'code', 'name',
    'kan_code', 'kan_name', 'kou_code', 'kou_name', 'moku_code', 'moku_name', 'amount_yen', 'is_leaf',
    'cofog_status', 'cofog_code', 'is_interfund_transfer', 'interfund_transfer_to', 'origin_id'],
  {
    ...pathExprs('x'),
    amount_phase: AMOUNT_PHASE,
    is_leaf: `NOT EXISTS (SELECT 1 FROM expenditure_subject c WHERE c."parent_subject_id" = x."subject_id")`,
  },
  `expenditure_subject x ${rootAndPath('x')}`,
  { is_leaf: SUBJECT_LEAF }
)

/** 科目の下の内訳。同じ科目・同じ breakdown の depth = 1 の和が科目の額 */
export const DETAIL_TABLE = searchView(
  'details',
  'expenditure_detail',
  ['detail_id', 'node_key', 'parent_detail_id', 'subject_id', 'expenditure_id', ...ROOT_COLUMNS.slice(0, 4), 'amount_phase', ...ROOT_COLUMNS.slice(4),
    'kan_code', 'kan_name', 'kou_code', 'kou_name', 'moku_code', 'moku_name',
    'breakdown', 'source_heading', 'node_kind', 'depth', 'code', 'name', 'department', 'amount_yen', 'is_leaf', 'is_subject_remainder',
    'expenditure_setsu_id', 'is_interfund_transfer', 'interfund_transfer_to', 'origin_id'],
  {
    ...pathExprs('s'),
    amount_phase: AMOUNT_PHASE,
    is_leaf: `NOT EXISTS (SELECT 1 FROM expenditure_detail c WHERE c."parent_detail_id" = x."detail_id")`,
    is_subject_remainder: `x."depth" = 1 AND EXISTS (SELECT 1 FROM expenditure_subject c WHERE c."parent_subject_id" = x."subject_id")`,
  },
  `expenditure_detail x JOIN expenditure_subject s ON s."subject_id" = x."subject_id" ${rootAndPath('s')}`,
  { is_leaf: DETAIL_LEAF, is_subject_remainder: SUBJECT_REMAINDER }
)

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
export const BUDGET_PROPOSAL_TABLE = 'budget_proposal'
export const BUDGET_PROPOSAL_ORIGIN_TABLE = 'budget_proposal_origin'
/** 予算案の施策。資料の1件 */
export const BUDGET_MEASURE_TABLE = fiscalTable('budget_measures', 'budget_measure')
export const PROJECT_TABLE = 'project'
export const PROJECT_YEAR_TABLE = fiscalTable('project_years', 'project_year')

/** 事業の年度を事業の列（始め・終え・親）でも絞るための列。値は project にだけあり、検索の中で JOIN して引く（同じ事業の集約の中） */
export const PROJECT_FILTER_COLUMNS = ['first_year', 'first_year_kind', 'last_year', 'last_year_kind', 'parent_project_id'] as const

/** 事業の年度の検索の対象。行は事業の年度の列だけを返し、条件には事業の列も使える */
export const PROJECT_YEAR_SEARCH: FiscalTable = (() => {
  const y = PROJECT_YEAR_TABLE
  const extra = PROJECT_FILTER_COLUMNS.map((n) => TABLES[PROJECT_TABLE]!.columns.find((c) => c.name === n)!)
  const columns = [...y.columns, ...extra]
  const yearList = y.columns.map((c) => `y."${c.name}"`).join(', ')
  const projectList = PROJECT_FILTER_COLUMNS.map((n) => `p."${n}"`).join(', ')
  return {
    ...y,
    table: `(SELECT ${yearList}, ${projectList} FROM ${y.table} y JOIN ${PROJECT_TABLE} p ON p."project_id" = y."project_id")`,
    columns,
    types: new Map(columns.map((c) => [c.name, c.type])),
  }
})()

/**
 * 手で書いた行の schema の各列に、columns.json（dbt の _models.yml）の説明を付ける。
 * 列の集合・型・null の可否・accepted_values が columns.json と合うかは model.test.ts が照合する。
 */
export function described<T extends z.ZodRawShape>(table: string | readonly ColumnSpec[], shape: T): T {
  const columns = typeof table === 'string' ? TABLES[table]!.columns : table
  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [name, (schema as z.ZodType).describe(columns.find((c) => c.name === name)?.description ?? '')])
  ) as unknown as T
}
