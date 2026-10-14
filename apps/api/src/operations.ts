import { z } from 'zod'
import {
  COVERAGE_COLUMNS,
  COVERAGE_TABLE,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_DESCRIPTION,
  JURISDICTION_COLUMNS,
  JURISDICTION_SELECT_LIST,
  JURISDICTION_TABLE,
  NODE_TABLES,
  ORIGIN_COLUMNS,
  ORIGIN_SELECT_LIST,
  ORIGIN_TABLE,
  toRow,
  nullableIf,
  zodOf,
  type ColumnSpec,
  type NodeTable,
  type Row,
} from './columns'
import type { Db } from './db'
import { ApiError, invalid } from './errors'
import {
  DEFAULT_PAGE_SIZE,
  MAX_BINDS,
  MAX_LIST,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  MAX_YEARS,
  buildWhere,
  canonicalJson,
  searchInput,
  type SearchInput,
} from './search'

// 操作は一度だけ定義し、REST の route と MCP の tool の両方に登録する（ADR 0022）。

export const REQUIRED_HELP =
  `必須は document_kind（"settlement" は決算・支出済額、"initial" は当初予算額。意味の違う金額を足さない）と、` +
  `fiscal_year の {min, max}（西暦、幅 ${MAX_YEARS} 年以内）。`

export const SEARCH_EXAMPLE = {
  document_kind: 'settlement',
  fiscal_year: { min: 2025, max: 2025 },
  where: { node_kind: { eq: ['目'] }, cofog_code: { prefix: '10.4' } },
  order_by: [{ column: 'amount_yen', desc: true }],
  page_size: 50,
}

export const SUM_RULES = [
  '比較には提供された款・項・目の金額を使い、親と子を混ぜて合算しない。当初予算CSVの親金額は子の和から生成した値で、原典の印字値ではない。',
  'COFOG で比べるときは cofog_code の前方一致で目（node_kind = "目"）を集めて足す。assigned の目には COFOG のコードが一つだけ付くので二重計上は起きない。',
  'division のコードだけを持つ目（例: "10"）は配下のどの group に属するか決まっていない。"10.2*" の和にはそうした目を含めない。',
  '同じ団体・年度・資料区分・会計の目について、COFOG の全 division の和と、cofog_status が unclassifiable と out-of-scope の目の和を足すと歳出の総額になる。',
  '軸（axis）の異なる末端（is_leaf = true）を混ぜて足さない。科目・節・備考は同じ支出の独立した切り口で、一つの軸の末端だけを足す。',
]

// Get の子のページング。MCP は型を強制しない整数、REST の query は文字列から整数にする（どちらも 1〜1000）。
const NEXT_PAGE_TOKEN_HELP = `次のページの token。無ければ null。位置は ${MAX_OFFSET} 件目までで、それ以上は null になるので、条件を絞って問い合わせる。`

const pageSizeDescription = `1ページの件数（1〜${MAX_PAGE_SIZE}、既定 ${DEFAULT_PAGE_SIZE}）。`
const getPageSize = z.int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe(pageSizeDescription)
const queryPageSize = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe(pageSizeDescription)
const pageToken = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]*$/, 'page_token の形式が不正です')
  .optional()
  .describe('前回の応答の next_page_token。document_kind と node_id は前回と同じにする。')

// meta の id を付けると、JSON Schema では $defs に一度だけ出て $ref で参照される（tools/list と OpenAPI が小さくなる）。
const Origin = z
  .strictObject(Object.fromEntries(ORIGIN_COLUMNS.map((c) => [c.name, nullableIf(zodOf(c.type), c)])))
  .meta({ id: 'Origin', description: '原典（資料名・URL・SHA-256）。' })

// 木の表の列は資料区分が違っても同じ集合（pipeline の生成器が検査する）。応答の行には document_kind を先頭に付ける。
const anyTable = NODE_TABLES.values().next().value as NodeTable
const Node = z
  .strictObject({
    document_kind: z.string(),
    ...Object.fromEntries(anyTable.columns.map((c) => [c.name, nullableIf(zodOf(c.type), c)])),
  })
  .meta({ id: 'Node', description: '歳出の木のノード。列の意味は describe_expenditure_columns。' })

const ORIGINS_HELP = '結果の行が指す原典。行の origin_id から引く。'

const withKind = (t: NodeTable, raw: Record<string, unknown>): Row => ({
  document_kind: t.documentKind,
  ...toRow(t.columns, raw),
})

export interface Ctx {
  db: Db
}

export interface Operation {
  name: string
  summary: string
  /** get は query と path、post は body に input を受ける */
  method: 'get' | 'post'
  /** REST の path（OpenAPI の `{param}` 形式） */
  path: string
  /** input のうち path に入る項目。残りは query */
  pathParams: readonly string[]
  /** MCP の tool の description。AI が使い方を tool 説明だけで分かるようにする */
  description: string
  input: z.ZodObject
  /** REST の body の例（OpenAPI の example）。文書の code sample に使う */
  example?: Record<string, unknown>
  /** get の REST の query。MCP と違い文字列から数値にする */
  restQuery?: z.ZodObject
  output: z.ZodType
  /** MCP Apps の View で結果を表にするか（MCP だけ。REST には影響しない） */
  view?: boolean
  run(ctx: Ctx, input: Record<string, unknown>): Promise<unknown>
}

// --- page_token: base64url(JSON {o: offset, h: 問い合わせの指紋}) ---

const b64 = (s: string) => btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const unb64 = (s: string) => atob(s.replaceAll('-', '+').replaceAll('_', '/'))

async function fingerprint(parts: unknown[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(parts))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function encodeToken(offset: number, parts: unknown[]): Promise<string> {
  return b64(JSON.stringify({ o: offset, h: await fingerprint(parts) }))
}

/** 次の位置が上限を超えるなら token を出さない（出しても次の要求が 400 になるだけ）。 */
async function nextToken(offset: number, parts: unknown[]): Promise<string | null> {
  return offset > MAX_OFFSET ? null : encodeToken(offset, parts)
}

export async function decodeToken(token: string | undefined, parts: unknown[]): Promise<number> {
  if (!token) return 0
  let parsed: { o?: unknown; h?: unknown } | null
  try {
    parsed = JSON.parse(unb64(token))
  } catch {
    throw invalid('page_token が不正です')
  }
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.o !== 'number' || !Number.isSafeInteger(parsed.o) || parsed.o < 0)
    throw invalid('page_token が不正です')
  if (parsed.o > MAX_OFFSET)
    throw invalid(`page_token の位置が上限（${MAX_OFFSET}）を超えています。条件を絞ってください`)
  if (parsed.h !== (await fingerprint(parts)))
    throw invalid('page_token は別の問い合わせのものです。page_size 以外の入力を変えずに渡してください')
  return parsed.o
}

async function searchNodes(ctx: Ctx, raw: Record<string, unknown>) {
  const { db } = ctx
  const input = raw as unknown as SearchInput
  const t = NODE_TABLES.get(input.document_kind)
  if (!t) throw invalid(`document_kind は ${DOCUMENT_KINDS.join('・')} のどれかです: ${input.document_kind}`)
  const where = buildWhere(t, input.fiscal_year, input.where as never)
  const order = [...(input.order_by ?? [])]
  if (!order.some((k) => k.column === 'node_id')) order.push({ column: 'node_id' })
  const orderSql = order.map((k) => `"${k.column}"${k.desc ? ' DESC' : ''}`).join(', ')
  const { page_size: limit, page_token: token, ...query } = input
  const fp = ['search', canonicalJson(query)]
  const offset = await decodeToken(token, fp)

  // ノードと原典は1つの batch（トランザクション）で読み、同期の入れ替えをまたいで食い違わないようにする。
  const [page, origins] = await db.batch([
    db
      .prepare(`SELECT ${t.selectList} FROM ${t.table} WHERE ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...where.params, limit + 1, offset),
    db
      .prepare(
        `SELECT ${ORIGIN_SELECT_LIST} FROM ${ORIGIN_TABLE} WHERE origin_id IN ` +
          `(SELECT origin_id FROM ${t.table} WHERE ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?) ORDER BY origin_id`
      )
      .bind(...where.params, limit, offset),
  ])
  const more = page!.results.length > limit
  return {
    nodes: page!.results.slice(0, limit).map((r) => withKind(t, r)),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    origins: origins!.results,
  }
}

async function getNode(ctx: Ctx, input: Record<string, unknown>) {
  const { db } = ctx
  const kind = input.document_kind as string
  const nodeId = input.node_id as string
  const t = NODE_TABLES.get(kind)
  if (!t) throw invalid(`document_kind は ${DOCUMENT_KINDS.join('・')} のどれかです: ${kind}`)
  const limit = (input.page_size as number | undefined) ?? DEFAULT_PAGE_SIZE
  const fp = ['get', kind, nodeId]
  const offset = await decodeToken(input.page_token as string | undefined, fp)
  const childrenSql = `SELECT ${t.selectList} FROM ${t.table} WHERE parent_node_id = ? ORDER BY "axis", "node_id" LIMIT ? OFFSET ?`

  // ノード・子・原典を1つの batch で読む（search と同じく、入れ替えをまたいで食い違わない）。
  const [self, kids, origins] = await db.batch([
    db.prepare(`SELECT ${t.selectList} FROM ${t.table} WHERE node_id = ?`).bind(nodeId),
    db.prepare(childrenSql).bind(nodeId, limit + 1, offset),
    db
      .prepare(
        `SELECT ${ORIGIN_SELECT_LIST} FROM ${ORIGIN_TABLE} WHERE origin_id IN ` +
          `(SELECT origin_id FROM ${t.table} WHERE node_id = ? ` +
          `UNION SELECT origin_id FROM (SELECT origin_id FROM ${t.table} WHERE parent_node_id = ? ORDER BY "axis", "node_id" LIMIT ? OFFSET ?)) ORDER BY origin_id`
      )
      .bind(nodeId, nodeId, limit, offset),
  ])
  const raw = self!.results[0]
  if (!raw) throw new ApiError(404, 'NOT_FOUND', `ノードが見つかりません: ${kind}/${nodeId}`)
  const more = kids!.results.length > limit
  const rows = kids!.results.slice(0, limit).map((r) => withKind(t, r))
  const children: Record<string, Row[]> = {}
  for (const r of rows) (children[String(r.axis)] ??= []).push(r)
  return {
    node: withKind(t, raw),
    children,
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    origins: origins!.results,
  }
}

// --- 団体と収録範囲 ---

const MAX_JURISDICTION_PAGE_SIZE = 100
const DEFAULT_JURISDICTION_PAGE_SIZE = 20
const MAX_NAME = 50
const jurisdictionPageSizeDescription = `1ページの団体の数（1〜${MAX_JURISDICTION_PAGE_SIZE}、既定 ${DEFAULT_JURISDICTION_PAGE_SIZE}）。`

const describeColumn = (columns: ColumnSpec[], name: string) => columns.find((c) => c.name === name)?.description ?? ''
/** columns.json の列から、型・null の可否・説明の付いた schema を作る */
const field = (columns: ColumnSpec[], name: string) => {
  const c = columns.find((c) => c.name === name)!
  return nullableIf(zodOf(c.type), c).describe(c.description ?? '')
}
const pick = (columns: ColumnSpec[], names: string[]) => Object.fromEntries(names.map((n) => [n, field(columns, n)]))

const CoverageOrigin = z
  .strictObject(pick(ORIGIN_COLUMNS, ['origin_id', 'title', 'url', 'format']))
  .meta({ id: 'CoverageOrigin', description: '明細の出典の原典。' })

const Coverage = z
  .strictObject({
    fiscal_year: z.int().describe(describeColumn(COVERAGE_COLUMNS, 'fiscal_year')),
    document_kind: z.enum(DOCUMENT_KINDS).describe(DOCUMENT_KIND_DESCRIPTION),
    accounts: z
      .array(
        z.strictObject({
          account_name: z.string().describe(describeColumn(COVERAGE_COLUMNS, 'account_name')),
          account_kind: z.string().describe(describeColumn(COVERAGE_COLUMNS, 'account_kind')),
          origins: z.array(CoverageOrigin).describe('この会計の明細が指す原典すべて。'),
        })
      )
      .describe('明細がある会計。一般会計が先。'),
  })
  .meta({ id: 'Coverage', description: '明細がある年度・資料区分と、その会計。' })

const Jurisdiction = z
  .strictObject({
    ...pick(JURISDICTION_COLUMNS, ['jurisdiction_code', 'name', 'prefecture_code', 'prefecture_name', 'ocd_id']),
    coverage: z
      .array(Coverage)
      .describe('収録範囲（年度の昇順、同じ年度は当初予算・決算の順）。空なら、この団体の明細は収録していない。明細があることを示し、会計全体・全事業を収録し終えたことは保証しない。'),
  })
  .meta({ id: 'Jurisdiction', description: '団体と、その収録範囲。' })

interface CoverageRow {
  jurisdiction_code: string
  fiscal_year: number
  document_kind: string
  account_name: string
  account_kind: string
  origin_id: string
  title: string
  url: string
  format: string
}

/** 団体コード順に並んだ行を、団体 → 年度・資料区分 → 会計 → 原典の入れ子にする（行の順を保つ）。 */
function nestCoverage(rows: CoverageRow[]) {
  const out = new Map<string, z.infer<typeof Coverage>[]>()
  for (const r of rows) {
    const list = out.get(r.jurisdiction_code) ?? []
    out.set(r.jurisdiction_code, list)
    let cov = list.at(-1)
    if (!cov || cov.fiscal_year !== r.fiscal_year || cov.document_kind !== r.document_kind) {
      cov = { fiscal_year: r.fiscal_year, document_kind: r.document_kind, accounts: [] }
      list.push(cov)
    }
    let account = cov.accounts.at(-1)
    if (!account || account.account_name !== r.account_name) {
      account = { account_name: r.account_name, account_kind: r.account_kind, origins: [] }
      cov.accounts.push(account)
    }
    account.origins.push({ origin_id: r.origin_id, title: r.title, url: r.url, format: r.format })
  }
  return out
}

async function listJurisdictions(ctx: Ctx, input: Record<string, unknown>) {
  const { db } = ctx
  const name = (input.name as string | undefined)?.normalize('NFKC').trim() || undefined
  const code = input.code as string | undefined
  const limit = (input.page_size as number | undefined) ?? DEFAULT_JURISDICTION_PAGE_SIZE
  const conds: string[] = []
  const params: string[] = []
  if (name !== undefined) {
    conds.push('instr("name", ?) > 0')
    params.push(name)
  }
  if (code !== undefined) {
    // 5桁は検査数字を除いた同じコード。検査数字は先頭5桁で決まるので、先頭5桁の一致で一つに決まる
    conds.push(code.length === 5 ? 'substr("jurisdiction_code", 1, 5) = ?' : '"jurisdiction_code" = ?')
    params.push(code)
  }
  const where = conds.length > 0 ? conds.join(' AND ') : '1 = 1'
  const fp = ['jurisdictions', name ?? null, code ?? null]
  const offset = await decodeToken(input.page_token as string | undefined, fp)
  const pageSql = `SELECT "jurisdiction_code" FROM ${JURISDICTION_TABLE} WHERE ${where} ORDER BY "jurisdiction_code" LIMIT ? OFFSET ?`

  // 団体と収録範囲を1つの batch で読み、同期の入れ替えをまたいで食い違わないようにする。集計は marts で済ませてあり、ここでは並べ替えて入れ子にするだけ。
  const [page, coverage] = await db.batch([
    db
      .prepare(`SELECT ${JURISDICTION_SELECT_LIST} FROM ${JURISDICTION_TABLE} WHERE ${where} ORDER BY "jurisdiction_code" LIMIT ? OFFSET ?`)
      .bind(...params, limit + 1, offset),
    db
      .prepare(
        `SELECT c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_name", c."account_kind", o."origin_id", o."title", o."url", o."format" ` +
          `FROM ${COVERAGE_TABLE} c JOIN ${ORIGIN_TABLE} o ON o."origin_id" = c."origin_id" ` +
          `WHERE c."jurisdiction_code" IN (${pageSql}) ` +
          `ORDER BY c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_kind" <> '一般会計', c."account_name", o."title", o."origin_id"`
      )
      .bind(...params, limit, offset),
  ])
  const more = page!.results.length > limit
  const nested = nestCoverage(coverage!.results as unknown as CoverageRow[])
  return {
    jurisdictions: page!.results.slice(0, limit).map((r) => ({
      ...toRow(JURISDICTION_COLUMNS, r),
      coverage: nested.get(String(r.jurisdiction_code)) ?? [],
    })),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
  }
}

const listJurisdictionsInput = {
  name: z
    .string()
    .max(MAX_NAME)
    .regex(/^[^\u0000-\u001f\u007f]*$/, '制御文字は使えません')
    .optional()
    .describe('団体名の部分一致（例: "武蔵野市"、"府中"）。全角・半角の違いは NFKC で揃えて比べる。同名の団体はすべて返るので、prefecture_name と jurisdiction_code で区別する。'),
  code: z
    .string()
    .regex(/^[0-9]{5,6}$/, 'code は5桁か6桁の数字です')
    .optional()
    .describe('全国地方公共団体コード。6桁（末尾は検査数字）でも、検査数字を除いた5桁でもよい。'),
  page_token: z
    .string()
    .max(512)
    .regex(/^[A-Za-z0-9_-]*$/, 'page_token の形式が不正です')
    .optional()
    .describe('前回の応答の next_page_token。name と code は前回と同じにする。'),
}

async function describeColumns() {
  // 資料区分ごとの説明を列名でまとめる（列の集合は表をまたいで同じ）
  const columns = new Map<string, { name: string; type: string; description: Record<string, string> }>()
  columns.set('document_kind', {
    name: 'document_kind',
    type: 'string',
    description: Object.fromEntries([...NODE_TABLES.keys()].map((k) => [k, DOCUMENT_KIND_DESCRIPTION])),
  })
  for (const t of NODE_TABLES.values())
    for (const c of t.columns) {
      const entry = columns.get(c.name) ?? { name: c.name, type: c.type, description: {} }
      entry.description[t.documentKind] = c.description ?? ''
      columns.set(c.name, entry)
    }
  const names = [...columns.keys()]
  return {
    document_kinds: [
      { name: 'settlement', description: '決算。amount_yen は支出済額（円）。' },
      { name: 'initial', description: '当初予算。amount_yen は当初予算額（円）。' },
    ],
    where_columns: names.filter((n) => n !== 'document_kind' && n !== 'fiscal_year'),
    order_by_columns: names.filter((n) => n !== 'document_kind'),
    required_input: REQUIRED_HELP,
    search_example: SEARCH_EXAMPLE,
    where_conditions: WHERE_HELP,
    sum_rules: SUM_RULES,
    columns: [...columns.values()],
    origin_columns: ORIGIN_COLUMNS,
  }
}

const WHERE_HELP = {
  string: `eq・not_eq（${MAX_LIST} 個まで、eq は OR）、prefix・suffix・contains（前方・後方・部分一致）、is_null`,
  integer: `eq・not_eq（${MAX_LIST} 個まで）、min・max（以上・以下）、is_null`,
  number: 'min・max（以上・以下）、is_null',
  boolean: 'eq',
  combine: `列どうしは AND。列をまたぐ OR と NOT は無いので、2回に分けて問い合わせる。fiscal_year の年数と条件の値の合計は ${MAX_BINDS} 個まで。`,
}

const searchDescription =
  '歳出の木のノード（款・項・目と、節・備考など別の軸の内訳）を条件で絞って一覧する。検索の前に describe_expenditure_columns を一度読む。' +
  '団体の比較は node_kind を "目" などに絞って行い、詳細は get_expenditure_node で木を辿る。' +
  '資料区分や軸の違う金額を足さない。足すときは describe_expenditure_columns の sum_rules に従う。where は列をまたぐ OR・NOT が無いので、2回に分けて問い合わせる。'

const listJurisdictionsDescription =
  '団体（自治体）の名称・6桁の団体コード・都道府県と、その団体の収録範囲（明細を検索できる年度・資料区分・会計と、明細の出典の原典の標題・URL）を返す。' +
  '歳出を検索する前に、団体コードと、比べたい年度・資料区分が収録されているかをここで確かめる。' +
  '名称（部分一致）か団体コード（5桁・6桁）で絞り、絞らなければ全団体を団体コード順に返す。収録の無い団体は coverage が空。' +
  '返った jurisdiction_code（6桁）・fiscal_year・document_kind・account_name は search_expenditure_nodes の条件にそのまま使える。検索は5桁のコードを受け付けず0件になるので、ここで6桁を引いてから渡す。名前とコードの両方を渡すと AND。'

export const operations: Operation[] = [
  {
    name: 'list_jurisdictions',
    summary: '団体と収録範囲',
    method: 'get',
    path: '/v1/jurisdictions',
    pathParams: [],
    description: listJurisdictionsDescription,
    input: z.strictObject({
      ...listJurisdictionsInput,
      page_size: z.int().min(1).max(MAX_JURISDICTION_PAGE_SIZE).default(DEFAULT_JURISDICTION_PAGE_SIZE).describe(jurisdictionPageSizeDescription),
    }),
    restQuery: z.strictObject({
      ...listJurisdictionsInput,
      page_size: z.coerce.number().int().min(1).max(MAX_JURISDICTION_PAGE_SIZE).default(DEFAULT_JURISDICTION_PAGE_SIZE).describe(jurisdictionPageSizeDescription),
    }),
    output: z.strictObject({
      jurisdictions: z.array(Jurisdiction).describe('団体コードの昇順。'),
      next_page_token: z.string().nullable().describe(NEXT_PAGE_TOKEN_HELP),
    }),
    view: true,
    run: listJurisdictions,
  },
  {
    name: 'search_expenditure_nodes',
    summary: '歳出の木のノードの検索',
    method: 'post',
    path: '/v1/expenditure/nodes:search',
    pathParams: [],
    description: searchDescription,
    input: searchInput,
    example: SEARCH_EXAMPLE,
    output: z.strictObject({
      nodes: z.array(Node),
      next_page_token: z.string().nullable().describe(NEXT_PAGE_TOKEN_HELP),
      origins: z.array(Origin).describe(ORIGINS_HELP),
    }),
    view: true,
    run: searchNodes,
  },
  {
    name: 'get_expenditure_node',
    summary: '歳出のノード一つと軸ごとの子',
    method: 'get',
    path: '/v1/expenditure/nodes/{document_kind}/{node_id}',
    pathParams: ['document_kind', 'node_id'],
    description: 'ノード一つ（document_kind と node_id で識別）と、その子を軸（axis）ごとに返す。search_expenditure_nodes で見つけたノードの内訳を辿るときに使う。',
    input: z.strictObject({
      document_kind: z.enum(DOCUMENT_KINDS).describe('資料区分（settlement か initial）。'),
      node_id: z.string().regex(/^[0-9a-f]{64}$/).describe('search の応答の node_id（小文字 16 進 64 文字）。'),
      page_size: getPageSize,
      page_token: pageToken,
    }),
    restQuery: z.strictObject({ page_size: queryPageSize, page_token: pageToken }),
    output: z.strictObject({
      node: Node,
      children: z.record(z.string(), z.array(Node)).describe('軸（axis）ごとの子。別の軸の子を同じ金額に混ぜて足さない。'),
      next_page_token: z.string().nullable().describe(NEXT_PAGE_TOKEN_HELP),
      origins: z.array(Origin).describe(ORIGINS_HELP),
    }),
    view: true,
    run: getNode,
  },
  {
    name: 'describe_expenditure_columns',
    summary: '列の説明と金額の和の条件',
    method: 'get',
    path: '/v1/expenditure/columns',
    pathParams: [],
    description: '歳出の木の列の説明と、金額を足すときの条件（sum_rules）、検索の入力の例（search_example）を返す。検索の前に一度読む。',
    input: z.strictObject({}),
    output: z.strictObject({
      document_kinds: z.array(z.strictObject({ name: z.string(), description: z.string() })),
      where_columns: z.array(z.string()),
      order_by_columns: z.array(z.string()),
      required_input: z.string(),
      search_example: searchInput,
      where_conditions: z.record(z.string(), z.string()),
      sum_rules: z.array(z.string()),
      columns: z.array(
        z.strictObject({ name: z.string(), type: z.string(), description: z.record(z.string(), z.string()) })
      ),
      origin_columns: z.array(z.strictObject({ name: z.string(), type: z.string(), description: z.string().nullable(), nullable: z.boolean().optional() })),
    }),
    run: describeColumns,
  },
]
