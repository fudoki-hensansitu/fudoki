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
  kind: 'subjects' | 'details' | 'revenue_subjects' | 'revenue_details' | 'evaluation_sheets' | 'project_years'
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
const pathExprs = (s: string, p = 'p', g = 'g') => ({
  kan_code: `CASE WHEN ${s}."level" = '款' THEN ${s}."code" WHEN ${p}."level" = '款' THEN ${p}."code" ELSE ${g}."code" END`,
  kan_name: `CASE WHEN ${s}."level" = '款' THEN ${s}."name" WHEN ${p}."level" = '款' THEN ${p}."name" ELSE ${g}."name" END`,
  kou_code: `CASE WHEN ${s}."level" = '項' THEN ${s}."code" WHEN ${p}."level" = '項' THEN ${p}."code" END`,
  kou_name: `CASE WHEN ${s}."level" = '項' THEN ${s}."name" WHEN ${p}."level" = '項' THEN ${p}."name" END`,
  moku_code: `CASE WHEN ${s}."level" = '目' THEN ${s}."code" END`,
  moku_name: `CASE WHEN ${s}."level" = '目' THEN ${s}."name" END`,
})

/** 列の並びと、それぞれを求める式から検索の対象を作る。表の列は表名の別名 x から引く */
function searchView(kind: FiscalTable['kind'], table: string, order: readonly string[], exprs: Record<string, string>, from: string, extra: Record<string, ColumnSpec>, rootTable = 'expenditure'): FiscalTable {
  const own = TABLES[table]!
  const root = TABLES[rootTable]!.columns
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

// --- 歳入の科目の検索。歳出の科目と同じ形（根・所属する款・項・目・子の有無を SQL の中で求める） ---

const REVENUE_LEAF: ColumnSpec = {
  name: 'is_leaf',
  type: 'boolean',
  nullable: false,
  description: '科目の子を持たないか（目と、目の無い項・款）。同じ資料の is_leaf の行の和が歳入の総額。',
}
const REVENUE_CATEGORY: ColumnSpec = {
  ...TABLES['fiscal_revenue_category']!.columns.find((c) => c.name === 'category')!,
  nullable: true,
  description:
    '所属する款の歳入の区分（風土記の判断。款の名前で fiscal_revenue_category を引く）。まちの税・国・都道府県から配られるお金・国・都道府県の支出金・借入れ・その他。辞書に無い款（一般会計以外・都道府県など）は NULL。',
}
const revenuePath = pathExprs('x')

/** 歳入の款・項・目。同じ資料・会計の款の和が総額 */
export const REVENUE_SUBJECT_TABLE = searchView(
  'revenue_subjects',
  'revenue_subject',
  ['subject_id', 'node_key', 'parent_subject_id', 'revenue_id', ...ROOT_COLUMNS.slice(0, 4), 'amount_phase', ...ROOT_COLUMNS.slice(4), 'level', 'code', 'name',
    'kan_code', 'kan_name', 'kou_code', 'kou_name', 'moku_code', 'moku_name', 'amount_yen', 'is_leaf', 'category', 'origin_id'],
  {
    ...revenuePath,
    amount_phase: AMOUNT_PHASE,
    is_leaf: `NOT EXISTS (SELECT 1 FROM revenue_subject c WHERE c."parent_subject_id" = x."subject_id")`,
    category: `(SELECT k."category" FROM fiscal_revenue_category k WHERE k."kan_name" = ${revenuePath.kan_name})`,
  },
  `revenue_subject x JOIN revenue e ON e."revenue_id" = x."revenue_id" ` +
    `LEFT JOIN revenue_subject p ON p."subject_id" = x."parent_subject_id" LEFT JOIN revenue_subject g ON g."subject_id" = p."parent_subject_id"`,
  { is_leaf: REVENUE_LEAF, category: REVENUE_CATEGORY },
  'revenue'
)
/** 歳入の科目の下の内訳（節と、その下の印字）。同じ科目の depth = 1 の和が科目の額。歳出の節マスタとは別の区分 */
export const REVENUE_DETAIL_TABLE = searchView(
  'revenue_details',
  'revenue_detail',
  ['detail_id', 'node_key', 'parent_detail_id', 'subject_id', 'revenue_id', ...ROOT_COLUMNS.slice(0, 4), 'amount_phase', ...ROOT_COLUMNS.slice(4),
    'kan_code', 'kan_name', 'kou_code', 'kou_name', 'moku_code', 'moku_name',
    'source_heading', 'node_kind', 'depth', 'code', 'name', 'amount_yen', 'is_leaf', 'origin_id'],
  {
    ...pathExprs('s'),
    amount_phase: AMOUNT_PHASE,
    is_leaf: `NOT EXISTS (SELECT 1 FROM revenue_detail c WHERE c."parent_detail_id" = x."detail_id")`,
  },
  `revenue_detail x JOIN revenue_subject s ON s."subject_id" = x."subject_id" JOIN revenue e ON e."revenue_id" = x."revenue_id" ` +
    `LEFT JOIN revenue_subject p ON p."subject_id" = s."parent_subject_id" LEFT JOIN revenue_subject g ON g."subject_id" = p."parent_subject_id"`,
  { is_leaf: DETAIL_LEAF },
  'revenue'
)
/** 歳入の科目が印字された位置（line_id は subject_id） */
export const REVENUE_LOCATION_TABLE = 'revenue_location'
export const REVENUE_LOCATION_SELECT_LIST = selectList(TABLES[REVENUE_LOCATION_TABLE]!.columns)

/** 科目・内訳の行が印字された位置（line_id は subject_id か detail_id） */
export const LOCATION_TABLE = 'expenditure_location'
export const LOCATION_COLUMNS = TABLES[LOCATION_TABLE]!.columns
export const LOCATION_SELECT_LIST = selectList(LOCATION_COLUMNS)

export const ORIGIN_TABLE = 'fiscal_origin'
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

/** 指した科目の COFOG で絞るための列（initial_・settlement_ の科目ごと）。値は科目にだけあり、検索の中で科目から引く */
const cofogCode = (kind: 'initial' | 'settlement'): ColumnSpec => ({
  name: `${kind}_cofog_code`,
  type: 'string',
  nullable: true,
  description: `${kind === 'initial' ? '当初予算' : '決算'}の科目（${kind}_expenditure_subject_id）の cofog_code（例 '10.4'）。科目から引く。分類の無い科目は NULL。絞り込みだけに使い、行には返さない。`,
})
const COFOG_CODE_COLUMNS = [cofogCode('initial'), cofogCode('settlement')]
const cofogOf = (subjectId: string) => `(SELECT k."cofog_code" FROM expenditure_subject k WHERE k."subject_id" = ${subjectId})`

/** 評価シートの検索の対象。行はシートの列だけを返し、条件には科目の COFOG も使える */
export const EVALUATION_SHEET_SEARCH: FiscalTable = (() => {
  const columns = [...EVALUATION_SHEET_TABLE.columns, ...COFOG_CODE_COLUMNS]
  const own = EVALUATION_SHEET_TABLE.columns.map((c) => `x."${c.name}"`).join(', ')
  return {
    ...EVALUATION_SHEET_TABLE,
    table: `(SELECT ${own}, ${cofogOf('x."initial_expenditure_subject_id"')} AS "initial_cofog_code", ${cofogOf('x."settlement_expenditure_subject_id"')} AS "settlement_cofog_code" FROM evaluation_sheet x)`,
    columns,
    types: new Map(columns.map((c) => [c.name, c.type])),
    selectList: selectList(columns),
  }
})()
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

/**
 * 事業の年度が指す内訳 a の行と、その科目・根・親・祖父母の JOIN（a は i か s）。内訳の検索の副問い合わせ（DETAIL_TABLE）を
 * LEFT JOIN すると SQLite が内訳の全行を作ってしまうので、表を直に JOIN する。
 */
const lineOf = (a: 'i' | 's', id: string) => {
  const path = pathExprs(`${a}k`, `${a}p`, `${a}g`)
  return {
    join: `LEFT JOIN expenditure_detail ${a} ON ${a}."detail_id" = ${id}
LEFT JOIN expenditure_subject ${a}k ON ${a}k."subject_id" = ${a}."subject_id"
LEFT JOIN expenditure ${a}e ON ${a}e."expenditure_id" = ${a}k."expenditure_id"
LEFT JOIN expenditure_subject ${a}p ON ${a}p."subject_id" = ${a}k."parent_subject_id"
LEFT JOIN expenditure_subject ${a}g ON ${a}g."subject_id" = ${a}p."parent_subject_id"`,
    name: `${a}."name"`,
    account_name: `${a}e."account_name"`,
    kan_name: path.kan_name,
    kou_name: path.kou_name,
    moku_name: path.moku_name,
  }
}
const lines = () => ({ i: lineOf('i', 'y."initial_expenditure_detail_id"'), s: lineOf('s', 'y."settlement_expenditure_detail_id"') })

/** 事業の年度の行を組む SELECT（y が事業の年度、p が事業、i・s が当初予算・決算の内訳）。extra は足す列 */
// 結び方は2つ。既定は事業 p を外側に固定する（CROSS JOIN）。自由にすると SQLite（D1 は統計を持たない）は年度の索引で全自治体の
// その年度の事業の年度を先に読み、自治体の条件を後から当てるので、1自治体の検索が全国分を読む（2026-11-15 に D1 が overloaded になった）。
// p を先にすると、自治体・親・事業の ID の索引で事業を絞り、事業の年度は (project_id, fiscal_year) の索引で引く。
// 事業の年度の ID・内訳の ID で絞るときだけは p を先にすると全国の事業をなめるので、y を外側にし、年度の索引は使わせない（+）
type ProjectYearJoin = 'project-first' | 'year-first'
const projectYearSelect = (extra = '', join: ProjectYearJoin = 'project-first') => {
  const { i, s } = lines()
  return `SELECT y."project_year_id", p."project_id", p."jurisdiction_code", ${join === 'year-first' ? '+' : ''}y."fiscal_year" AS "fiscal_year",
  COALESCE(${i.name}, ${s.name}) AS "name", COALESCE(${i.account_name}, ${s.account_name}) AS "account_name",
  COALESCE(${i.kan_name}, ${s.kan_name}) AS "kan_name", COALESCE(${i.kou_name}, ${s.kou_name}) AS "kou_name", COALESCE(${i.moku_name}, ${s.moku_name}) AS "moku_name",
  y."initial_expenditure_detail_id", y."settlement_expenditure_detail_id",
  i."subject_id" AS "initial_expenditure_subject_id", s."subject_id" AS "settlement_expenditure_subject_id",
  i."amount_yen" AS "budget_yen", s."amount_yen" AS "settled_yen"${extra}
FROM ${join === 'year-first' ? `${PROJECT_YEAR_BASE} y CROSS JOIN ${PROJECT_TABLE} p` : `${PROJECT_TABLE} p CROSS JOIN ${PROJECT_YEAR_BASE} y`} ON y."project_id" = p."project_id"
${i.join}
${s.join}`
}

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
  const extra = [...PROJECT_FILTER_COLUMNS.map((n) => columnOf(PROJECT_TABLE, n)), ...COFOG_CODE_COLUMNS]
  const columns = [...PROJECT_YEAR_COLUMNS, ...extra]
  const select = PROJECT_FILTER_COLUMNS.map((n) => `, p."${n}"`).join('') + `, ik."cofog_code" AS "initial_cofog_code", sk."cofog_code" AS "settlement_cofog_code"`
  return viewOf('project_years', `(${projectYearSelect(select, join)})`, TABLES[PROJECT_YEAR_BASE]!.primary_key, columns)
}

/** 事業の年度の検索の対象。行は事業の年度の列だけを返し、条件には事業の列と科目の COFOG も使える */
export const PROJECT_YEAR_SEARCH = projectYearSearch('project-first')
/** 事業の年度の ID・内訳の ID で絞る検索の対象（事業の年度を外側にする）。列は PROJECT_YEAR_SEARCH と同じ */
export const PROJECT_YEAR_SEARCH_BY_YEAR_KEY = projectYearSearch('year-first')
/** 事業の年度の表の索引で引ける列。where にこの列の eq があれば PROJECT_YEAR_SEARCH_BY_YEAR_KEY で探す */
export const PROJECT_YEAR_KEY_COLUMNS = ['project_year_id', 'initial_expenditure_detail_id', 'settlement_expenditure_detail_id'] as const

/** 事業の名前・会計を引く、最新の年度の行（事業 p の副問い合わせ） */
const latestOf = (field: 'name' | 'account_name') => {
  const { i, s } = lines()
  return `(SELECT COALESCE(${i[field]}, ${s[field]}) FROM ${PROJECT_YEAR_BASE} y
  ${i.join}
  ${s.join}
  WHERE y."project_id" = p."project_id" ORDER BY y."fiscal_year" DESC LIMIT 1)`
}

/** 事業（JOIN した後の行）。FROM に置く副問い合わせ */
export const PROJECT_VIEW = `(SELECT p."project_id", p."jurisdiction_code",
  ${latestOf('name')} AS "name", ${latestOf('account_name')} AS "account_name",
  p."first_year", p."first_year_kind", p."last_year", p."last_year_kind", p."parent_project_id"
FROM ${PROJECT_TABLE} p)`
export const PROJECT_SELECT_LIST = selectList(PROJECT_COLUMNS)

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
