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
import { searchEvaluationsOperation, type EvaluationDeps } from './evaluations'
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
  '比較には提供された款・項・目の金額を使い、親と子を混ぜて合算しない。当初予算CSVの親金額は子の和から生成した値で、出典の印字値ではない。',
  'COFOG で比べるときは cofog_code の前方一致で目（node_kind = "目"）を集めて足す。assigned の目には COFOG のコードが一つだけ付くので二重計上は起きない。',
  'division のコードだけを持つ目（例: "10"）は配下のどの group に属するか決まっていない。"10.2*" の和にはそうした目を含めない。',
  '同じ自治体・年度・資料区分・会計の目について、COFOG の全 division の和と、cofog_status が unclassifiable と out-of-scope の目の和を足すと歳出の総額になる。',
  '軸（axis）の異なる末端（is_leaf = true）を混ぜて足さない。科目・節・備考は同じ支出の独立した切り口で、一つの軸の末端だけを足す。',
]

// Get の子のページング。MCP は型を強制しない整数、REST の query は文字列から整数にする（どちらも 1〜1000）。
const NEXT_PAGE_TOKEN_HELP = `次のページの token。無ければ null。位置は ${MAX_OFFSET} 件目までで、それ以上は null になるので、条件を絞って問い合わせる。`

const pageSizeDescription = `Number of results per page (1–${MAX_PAGE_SIZE}; default ${DEFAULT_PAGE_SIZE}).`
const getPageSize = z.int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe(pageSizeDescription)
const queryPageSize = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe(pageSizeDescription)
const pageToken = z
  .string()
  .max(512)
  .regex(/^[A-Za-z0-9_-]*$/, 'page_token の形式が不正です')
  .optional()
  .describe('next_page_token from the previous response. Keep document_kind and node_id unchanged.')

// meta の id を付けると、JSON Schema では $defs に一度だけ出て $ref で参照される（tools/list と OpenAPI が小さくなる）。
const Origin = z
  .strictObject(Object.fromEntries(ORIGIN_COLUMNS.map((c) => [c.name, nullableIf(zodOf(c.type), c)])))
  .meta({ id: 'Origin', description: '出典（資料名・URL・SHA-256）。' })

// 木の表の列は資料区分が違っても同じ集合（pipeline の生成器が検査する）。応答の行には document_kind を先頭に付ける。
const anyTable = NODE_TABLES.values().next().value as NodeTable
const Node = z
  .strictObject({
    document_kind: z.string(),
    ...Object.fromEntries(anyTable.columns.map((c) => [c.name, nullableIf(zodOf(c.type), c)])),
  })
  .meta({ id: 'Node', description: '歳出の木のノード。列の意味は describe_expenditure_columns。' })

const ORIGINS_HELP = '結果の行が指す出典。行の origin_id から引く。'

const withKind = (t: NodeTable, raw: Record<string, unknown>): Row => ({
  document_kind: t.documentKind,
  ...toRow(t.columns, raw),
})

export interface Ctx {
  db: Db
  /** 評価の検索の依存。AI Search・流量・日ごとの総数はここ越しに呼び、試験は偽物に差し替える。 */
  evaluation?: EvaluationDeps
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
  /** 回数の上限で 429 を返し得るか（REST の応答一覧に 429 を足す） */
  rateLimited?: boolean
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

  // ノードと出典は1つの batch（トランザクション）で読み、同期の入れ替えをまたいで食い違わないようにする。
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

  // ノード・子・出典を1つの batch で読む（search と同じく、入れ替えをまたいで食い違わない）。
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

// --- 自治体と収録範囲 ---

const MAX_JURISDICTION_PAGE_SIZE = 100
const DEFAULT_JURISDICTION_PAGE_SIZE = 20
const MAX_NAME = 50
const jurisdictionPageSizeDescription = `Municipalities per page (1–${MAX_JURISDICTION_PAGE_SIZE}; default ${DEFAULT_JURISDICTION_PAGE_SIZE}).`

const describeColumn = (columns: ColumnSpec[], name: string) => columns.find((c) => c.name === name)?.description ?? ''
/** columns.json の列から、型・null の可否・説明の付いた schema を作る */
const field = (columns: ColumnSpec[], name: string) => {
  const c = columns.find((c) => c.name === name)!
  return nullableIf(zodOf(c.type), c).describe(c.description ?? '')
}
const pick = (columns: ColumnSpec[], names: string[]) => Object.fromEntries(names.map((n) => [n, field(columns, n)]))

const CoverageOrigin = z
  .strictObject(pick(ORIGIN_COLUMNS, ['origin_id', 'title', 'url', 'format']))
  .meta({ id: 'CoverageOrigin', description: '明細が指す出典。' })

const Coverage = z
  .strictObject({
    fiscal_year: z.int().describe(describeColumn(COVERAGE_COLUMNS, 'fiscal_year')),
    document_kind: z.enum(DOCUMENT_KINDS).describe(DOCUMENT_KIND_DESCRIPTION),
    accounts: z
      .array(
        z.strictObject({
          account_name: z.string().describe(describeColumn(COVERAGE_COLUMNS, 'account_name')),
          account_kind: z.string().describe(describeColumn(COVERAGE_COLUMNS, 'account_kind')),
          origins: z.array(CoverageOrigin).optional().describe('この会計の明細が指す出典すべて。view が FULL のときだけ返る。'),
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
      .describe('収録範囲（年度の昇順、同じ年度は当初予算・決算の順）。空なら、この自治体の明細は収録していない。明細があることを示し、会計全体・全事業を収録し終えたことは保証しない。'),
  })
  .meta({ id: 'Jurisdiction', description: '自治体と、その収録範囲。' })

/**
 * 収録の無い自治体・年度・資料区分で、利用者を案内する統計の出典。数字は風土記に取り込まない（ADR 0037）。
 * 自治体が決算書を公開していない年度も、総務省の地方財政状況調査が普通会計の決算を款・項まで公開している。
 */
export const UNCOVERED_SOURCES = [
  {
    title: '市町村決算カード（総務省）',
    url: 'https://www.soumu.go.jp/iken/zaisei/card.html',
    description: '市町村ごとの普通会計の決算を、目的別（款）・性質別で1枚にまとめたもの。都道府県別の Excel。',
  },
  {
    title: '地方財政状況調査 市町村分 調査表（e-Stat）',
    url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200251&tstat=000001077755',
    description:
      '全市町村の普通会計の決算。表07〜13「歳出内訳及び財源内訳」が目的別の款・項（一部の款は項まで）を持つ。データセットの「調査年」は決算年度の翌年。',
  },
] as const

const UncoveredSource = z
  .strictObject({ title: z.string(), url: z.string(), description: z.string() })
  .meta({ id: 'UncoveredSource', description: '収録の無い年度で使える、風土記の外の統計の出典。' })

const UNCOVERED_SOURCES_HELP =
  '収録の無い自治体・年度の決算を見たいときの、風土記の外の統計の出典（どの自治体でも同じ）。風土記はこの数字を取り込まない。' +
  'どれも普通会計の決算で、事業（目）の単位は無く、風土記の一般会計とは範囲が違い合計も一致しない。当初予算と未公表の年度の数字は無い。'

interface CoverageRow {
  jurisdiction_code: string
  fiscal_year: number
  document_kind: string
  account_name: string
  account_kind: string
  // BASIC では出典の列を読まない
  origin_id?: string
  title?: string
  url?: string
  format?: string
}

/** 自治体コード順に並んだ行を、自治体 → 年度・資料区分 → 会計 → 出典の入れ子にする（行の順を保つ）。 */
function nestCoverage(rows: CoverageRow[], full: boolean) {
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
      account = { account_name: r.account_name, account_kind: r.account_kind, ...(full ? { origins: [] } : {}) }
      cov.accounts.push(account)
    }
    if (full) account.origins!.push({ origin_id: r.origin_id!, title: r.title!, url: r.url!, format: r.format! })
  }
  return out
}

async function listJurisdictions(ctx: Ctx, input: Record<string, unknown>) {
  const { db } = ctx
  const name = (input.name as string | undefined)?.normalize('NFKC').trim() || undefined
  const code = input.code as string | undefined
  const limit = (input.page_size as number | undefined) ?? DEFAULT_JURISDICTION_PAGE_SIZE
  const full = input.view === 'FULL'
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

  // 自治体と収録範囲を1つの batch で読み、同期の入れ替えをまたいで食い違わないようにする。集計は marts で済ませてあり、ここでは並べ替えて入れ子にするだけ。
  const [page, coverage] = await db.batch([
    db
      .prepare(`SELECT ${JURISDICTION_SELECT_LIST} FROM ${JURISDICTION_TABLE} WHERE ${where} ORDER BY "jurisdiction_code" LIMIT ? OFFSET ?`)
      .bind(...params, limit + 1, offset),
    db
      .prepare(
        full
          ? `SELECT c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_name", c."account_kind", o."origin_id", o."title", o."url", o."format" ` +
              `FROM ${COVERAGE_TABLE} c JOIN ${ORIGIN_TABLE} o ON o."origin_id" = c."origin_id" ` +
              `WHERE c."jurisdiction_code" IN (${pageSql}) ` +
              `ORDER BY c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_kind" <> '一般会計', c."account_name", o."title", o."origin_id"`
          : `SELECT DISTINCT c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_name", c."account_kind" ` +
              `FROM ${COVERAGE_TABLE} c ` +
              `WHERE c."jurisdiction_code" IN (${pageSql}) ` +
              `ORDER BY c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_kind" <> '一般会計', c."account_name"`
      )
      .bind(...params, limit, offset),
  ])
  const more = page!.results.length > limit
  const nested = nestCoverage(coverage!.results as unknown as CoverageRow[], full)
  return {
    jurisdictions: page!.results.slice(0, limit).map((r) => ({
      ...toRow(JURISDICTION_COLUMNS, r),
      coverage: nested.get(String(r.jurisdiction_code)) ?? [],
    })),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    uncovered_sources: UNCOVERED_SOURCES,
  }
}

const listJurisdictionsInput = {
  name: z
    .string()
    .max(MAX_NAME)
    .regex(/^[^\u0000-\u001f\u007f]*$/, '制御文字は使えません')
    .optional()
    .describe('Partial municipality name (e.g. "武蔵野市", "府中"), compared after NFKC normalization. All municipalities with matching names are returned; distinguish them using prefecture_name and jurisdiction_code.'),
  code: z
    .string()
    .regex(/^[0-9]{5,6}$/, 'code は5桁か6桁の数字です')
    .optional()
    .describe('Japanese local government code: six digits including the check digit, or five digits without it.'),
  page_token: z
    .string()
    .max(512)
    .regex(/^[A-Za-z0-9_-]*$/, 'page_token の形式が不正です')
    .optional()
    .describe('next_page_token from the previous response. Keep name and code unchanged.'),
}

/** AIP-157 の view。BASIC は軽い既定、FULL は全部 */
const JURISDICTION_VIEWS = ['BASIC', 'FULL'] as const
const jurisdictionViewDescription =
  'BASIC (default) returns municipalities and covered fiscal years, document kinds and accounts. FULL also returns sources per account (origin_id, title, URL and format). Use FULL only when source details are needed.'

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
  'Search expenditure tree nodes (款/kan, 項/kou, 目/moku and breakdowns on separate axes such as 節/setsu and notes). Read describe_expenditure_columns once before searching. ' +
  'Text filters match names printed in the source subject, project, setsu or notes fields (name, kan_name, kou_name). Narrative body text is not in these tables; if a project name is not printed, search words in the subject name. ' +
  'For comparisons across municipalities, filter node_kind to a consistent level such as "目", then use get_expenditure_node to explore details. ' +
  'Do not add amounts across document kinds or axes. Follow sum_rules from describe_expenditure_columns when summing. where has no cross-column OR or NOT; use separate queries for those alternatives.'

const listJurisdictionsDescription =
  'List municipality names, six-digit jurisdiction codes, prefectures and available expenditure coverage (fiscal years, document kinds and accounts). With view FULL, also return source titles and URLs for each account. ' +
  'Before searching expenditure, use this tool to check the municipality code and whether the years and document kinds you want to compare are covered. ' +
  'Filter by partial municipality name or a five- or six-digit code. Without filters, results are ordered by jurisdiction code. Pages default to 20 municipalities (maximum 100); follow next_page_token for more. Municipalities without data have empty coverage. ' +
  'When a wanted settlement year is not covered (for example, the municipality has not published its settlement document), do not treat it as zero; point the user to uncovered_sources, which hold official statistics at kan/kou level for the ordinary account (普通会計), not comparable to Fudoki general-account totals. ' +
  'Use returned jurisdiction_code (six digits), fiscal_year, document_kind and account_name directly in search_expenditure_nodes. Search does not accept five-digit codes as matches: resolve the six-digit code here first. Name and code filters are combined with AND.'

export const operations: Operation[] = [
  {
    name: 'list_jurisdictions',
    summary: 'Municipalities and expenditure coverage',
    method: 'get',
    path: '/v1/jurisdictions',
    pathParams: [],
    description: listJurisdictionsDescription,
    input: z.strictObject({
      ...listJurisdictionsInput,
      page_size: z.int().min(1).max(MAX_JURISDICTION_PAGE_SIZE).default(DEFAULT_JURISDICTION_PAGE_SIZE).describe(jurisdictionPageSizeDescription),
      view: z.enum(JURISDICTION_VIEWS).default('BASIC').describe(jurisdictionViewDescription),
    }),
    restQuery: z.strictObject({
      ...listJurisdictionsInput,
      page_size: z.coerce.number().int().min(1).max(MAX_JURISDICTION_PAGE_SIZE).default(DEFAULT_JURISDICTION_PAGE_SIZE).describe(jurisdictionPageSizeDescription),
      view: z.enum(JURISDICTION_VIEWS).default('BASIC').describe(jurisdictionViewDescription),
    }),
    output: z.strictObject({
      jurisdictions: z.array(Jurisdiction).describe('自治体コードの昇順。'),
      next_page_token: z.string().nullable().describe(NEXT_PAGE_TOKEN_HELP),
      uncovered_sources: z.array(UncoveredSource).describe(UNCOVERED_SOURCES_HELP),
    }),
    run: listJurisdictions,
  },
  {
    name: 'search_expenditure_nodes',
    summary: 'Search expenditure tree nodes',
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
    summary: 'Expenditure node and children by axis',
    method: 'get',
    path: '/v1/expenditure/nodes/{document_kind}/{node_id}',
    pathParams: ['document_kind', 'node_id'],
    description: 'Return one expenditure node, identified by document_kind and node_id, and its children grouped by axis. Use this to explore the breakdown of a node found by search_expenditure_nodes. Do not sum children from different axes together.',
    input: z.strictObject({
      document_kind: z.enum(DOCUMENT_KINDS).describe('Document kind: settlement (executed expenditure) or initial (initial budget).'),
      node_id: z.string().regex(/^[0-9a-f]{64}$/).describe('node_id from a search response (64 lowercase hexadecimal characters).'),
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
    summary: 'Column descriptions and aggregation rules',
    method: 'get',
    path: '/v1/expenditure/columns',
    pathParams: [],
    description: 'Describe expenditure tree columns, rules for adding amounts (sum_rules), and an example search input (search_example). Read this once before searching; follow sum_rules to avoid double counting parents and children or mixing independent breakdown axes.',
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
  searchEvaluationsOperation,
]
