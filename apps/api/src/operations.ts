import { z } from 'zod'
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_DESCRIPTION,
  NODE_TABLES,
  ORIGIN_COLUMNS,
  ORIGIN_SELECT_LIST,
  ORIGIN_TABLE,
  toRow,
  nullableIf,
  zodOf,
  type NodeTable,
  type Row,
} from './columns'
import type { Db } from './db'
import { ApiError, invalid } from './errors'
import { FilterError, compileFilter, conjuncts, parseFilter, requireScope, type Expr } from './filter'

// 操作は一度だけ定義し、REST の route と MCP の tool の両方に登録する（ADR 0022）。

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 1000
const MAX_ORDER_KEYS = 5
const ORIGIN_CHUNK = 90 // D1 は1文の bind が100まで

export const FILTER_HELP =
  'filter は AIP-160 の部分集合。比較（= != < <= > >=）、AND・OR・NOT（大文字）、括弧、' +
  '文字列の先頭か末尾の * による前方・後方・部分一致（例: cofog_code = "04.5*"）。' +
  '`:`・関数・並べただけの暗黙の AND・未知の列は 400。'

export const REQUIRED_HELP =
  'filter の最上位の AND に次の2つが必須: ' +
  '(1) document_kind = "settlement"（決算・支出済額）または "initial"（当初予算額）の一つ。意味の違う金額を足さない。' +
  '(2) fiscal_year を5年以内に絞る。fiscal_year = 2024、fiscal_year = 2023 OR fiscal_year = 2024（5つまで）、' +
  'fiscal_year >= 2022 AND fiscal_year <= 2024 のどれか。NOT の中は数えない。'

export const SUM_RULES = [
  '款・項・目の金額は原典に印字された値で、比較に和は要らない。',
  'COFOG で比べるときは cofog_code の前方一致で目（node_kind = "目"）を集めて足す。assigned の目には COFOG のコードが一つだけ付くので二重計上は起きない。',
  'division のコードだけを持つ目（例: "10"）は配下のどの group に属するか決まっていない。"10.2*" の和にはそうした目を含めない。',
  '同じ団体・年度・資料区分・会計の目について、COFOG の全 division の和と、cofog_status が unclassifiable と out-of-scope の目の和を足すと歳出の総額になる。',
  '軸（axis）の異なる末端（is_leaf = true）を混ぜて足さない。科目・節・備考は同じ支出の独立した切り口で、一つの軸の末端だけを足す。',
]

// .int() は JSON Schema に ±9e15 の範囲を出すので使わない。小数は切り捨てる。
const pageSize = z.coerce
  .number()
  .min(0)
  .optional()
  .describe(
    `1ページの件数（0 以上）。省略か 0 で既定の ${DEFAULT_PAGE_SIZE}。${MAX_PAGE_SIZE} を超えたら ${MAX_PAGE_SIZE} に丸める。`
  )
const pageToken = (about: string) => z.string().optional().describe(`前回の応答の next_page_token。${about}`)

const Origin = z.object(Object.fromEntries(ORIGIN_COLUMNS.map((c) => [c.name, nullableIf(zodOf(c.type), c)])))

// 木の表の列は資料区分が違っても同じ集合（pipeline の生成器が検査する）。応答の行には document_kind を先頭に付ける。
const anyTable = NODE_TABLES.values().next().value as NodeTable
const Node = z.object({
  document_kind: z.string(),
  ...Object.fromEntries(anyTable.columns.map((c) => [c.name, nullableIf(zodOf(c.type), c)])),
})

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
  /** REST の path（OpenAPI の `{param}` 形式） */
  path: string
  /** input のうち path に入る項目。残りは query */
  pathParams: readonly string[]
  /** MCP の tool の description。AI が使い方を tool 説明だけで分かるようにする */
  description: string
  input: z.ZodObject
  output: z.ZodType
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
  if (parsed.h !== (await fingerprint(parts)))
    throw invalid('page_token は別の問い合わせのものです。filter と order_by を変えずに渡してください')
  return parsed.o
}

function limitOf(size: unknown): number {
  const n = size === undefined ? 0 : (size as number)
  if (n < 0) throw invalid('page_size は 0 以上です')
  const whole = Math.floor(n)
  return whole === 0 ? DEFAULT_PAGE_SIZE : Math.min(whole, MAX_PAGE_SIZE)
}

/** AIP-132 の order_by（`amount_yen desc, name`）。許可した列だけで、末尾に node_id を足して順序を決める。 */
export function parseOrderBy(input: string | undefined, types: ReadonlyMap<string, unknown>): { sql: string; normalized: string } {
  const keys: { column: string; desc: boolean }[] = []
  for (const part of (input ?? '').split(',')) {
    const text = part.trim()
    if (text === '') continue
    const m = /^([a-z_0-9]+)(?:\s+(asc|desc))?$/i.exec(text)
    if (!m || !types.has(m[1]!)) throw invalid(`order_by に使えない指定です: ${text}`)
    if (keys.some((k) => k.column === m[1])) throw invalid(`order_by に同じ列が複数あります: ${m[1]}`)
    keys.push({ column: m[1]!, desc: m[2]?.toLowerCase() === 'desc' })
  }
  if (keys.length > MAX_ORDER_KEYS) throw invalid(`order_by は ${MAX_ORDER_KEYS} 列までです`)
  if (!keys.some((k) => k.column === 'node_id')) keys.push({ column: 'node_id', desc: false })
  return {
    sql: keys.map((k) => `"${k.column}"${k.desc ? ' DESC' : ''}`).join(', '),
    normalized: keys.map((k) => `${k.column} ${k.desc ? 'desc' : 'asc'}`).join(', '),
  }
}

async function originsOf({ db }: Ctx, rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.origin_id).filter((v): v is string => typeof v === 'string'))]
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += ORIGIN_CHUNK) chunks.push(ids.slice(i, i + ORIGIN_CHUNK))
  if (chunks.length === 0) return []
  const results = await db.batch(
    chunks.map((chunk) =>
      db
        .prepare(
          `SELECT ${ORIGIN_SELECT_LIST} FROM ${ORIGIN_TABLE} WHERE origin_id IN (${chunk.map(() => '?').join(',')}) ORDER BY origin_id`
        )
        .bind(...chunk)
    )
  )
  return results.flatMap((r) => r.results)
}

/** 最上位の AND から、表の選択に使った document_kind = "<kind>" の項を一つ除く（表の列ではないので SQL に入れない）。 */
export function withoutKindTerm(expr: Expr): Expr {
  const terms = conjuncts(expr)
  const i = terms.findIndex((e) => e.kind === 'cmp' && e.field === 'document_kind' && e.op === '=')
  return { kind: 'and', terms: terms.filter((_, j) => j !== i) }
}

async function listNodes(ctx: Ctx, input: Record<string, unknown>) {
  const { db } = ctx
  const filter = (input.filter as string | undefined) ?? ''
  if (filter.trim() === '') throw invalid('filter は必須です。' + REQUIRED_HELP)
  let where, t: NodeTable
  try {
    const expr = parseFilter(filter)
    const { documentKind } = requireScope(expr, DOCUMENT_KINDS)
    t = NODE_TABLES.get(documentKind)!
    where = compileFilter(withoutKindTerm(expr), t.types)
  } catch (e) {
    if (e instanceof FilterError) throw invalid(e.message)
    throw e
  }
  const order = parseOrderBy(input.order_by as string | undefined, t.types)
  const limit = limitOf(input.page_size)
  const fp = ['list', filter, order.normalized]
  const offset = await decodeToken(input.page_token as string | undefined, fp)

  const { results } = await db
    .prepare(`SELECT ${t.selectList} FROM ${t.table} WHERE ${where.sql} ORDER BY ${order.sql} LIMIT ? OFFSET ?`)
    .bind(...where.params, limit + 1, offset)
    .all()
  const more = results.length > limit
  const nodes = results.slice(0, limit).map((r) => withKind(t, r))
  return {
    nodes,
    next_page_token: more ? await encodeToken(offset + limit, fp) : null,
    origins: await originsOf(ctx, nodes),
  }
}

async function getNode(ctx: Ctx, input: Record<string, unknown>) {
  const { db } = ctx
  const kind = input.document_kind as string
  const nodeId = input.node_id as string
  const t = NODE_TABLES.get(kind)
  if (!t) throw invalid(`document_kind は ${DOCUMENT_KINDS.join('・')} のどれかです: ${kind}`)
  const limit = limitOf(input.page_size)
  const fp = ['get', kind, nodeId]
  const offset = await decodeToken(input.page_token as string | undefined, fp)

  const [self, kids] = await db.batch([
    db.prepare(`SELECT ${t.selectList} FROM ${t.table} WHERE node_id = ?`).bind(nodeId),
    db
      .prepare(
        `SELECT ${t.selectList} FROM ${t.table} WHERE parent_node_id = ? ORDER BY "axis", "node_id" LIMIT ? OFFSET ?`
      )
      .bind(nodeId, limit + 1, offset),
  ])
  const raw = self!.results[0]
  if (!raw) throw new ApiError(404, 'NOT_FOUND', `ノードが見つかりません: ${kind}/${nodeId}`)
  const node = withKind(t, raw)
  const more = kids!.results.length > limit
  const rows = kids!.results.slice(0, limit).map((r) => withKind(t, r))
  const children: Record<string, Row[]> = {}
  for (const r of rows) (children[String(r.axis)] ??= []).push(r)
  return {
    node,
    children,
    next_page_token: more ? await encodeToken(offset + limit, fp) : null,
    origins: await originsOf(ctx, [node, ...rows]),
  }
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
    filter_columns: names,
    order_by_columns: names.filter((n) => n !== 'document_kind'),
    filter_syntax: FILTER_HELP,
    required_filter: REQUIRED_HELP,
    sum_rules: SUM_RULES,
    columns: [...columns.values()],
    origin_columns: ORIGIN_COLUMNS,
  }
}

const listDescription =
  '歳出の木のノード（款・項・目と、節・備考など別の軸の内訳）を絞り込んで一覧する。' +
  '団体の比較は node_kind = "目" などで科目の軸の款・項・目を絞って行い、詳細は get_expenditure_node で木を辿る。' +
  FILTER_HELP +
  REQUIRED_HELP +
  '例1: document_kind = "settlement" AND fiscal_year = 2024 AND node_kind = "目" AND jurisdiction_code = "132039"。' +
  '例2: document_kind = "settlement" AND fiscal_year >= 2022 AND fiscal_year <= 2024 AND cofog_code = "04.5*"。' +
  'order_by は "amount_yen desc, name" の形（列は filter と同じ）。応答は {nodes, next_page_token, origins}。' +
  'origins は結果の行が指す原典（資料名・URL・SHA-256）で、行の origin_id から引く。' +
  '金額の和は API では求めない。足すときの条件は describe_expenditure_columns の sum_rules に従う。'

export const operations: Operation[] = [
  {
    name: 'list_expenditure_nodes',
    summary: '歳出の木のノードの一覧',
    path: '/v1/expenditure/nodes',
    pathParams: [],
    description: listDescription,
    input: z.object({
      filter: z.string().describe('AIP-160 の部分集合。document_kind と fiscal_year の絞り込みが必須。'),
      order_by: z.string().optional().describe('例: "amount_yen desc, name"。末尾に node_id が足される。'),
      page_size: pageSize,
      page_token: pageToken('filter と order_by は前回と同じにする。'),
    }),
    output: z.object({
      nodes: z.array(Node),
      next_page_token: z.string().nullable(),
      origins: z.array(Origin),
    }),
    run: listNodes,
  },
  {
    name: 'get_expenditure_node',
    summary: '歳出のノード一つと軸ごとの子',
    path: '/v1/expenditure/nodes/{document_kind}/{node_id}',
    pathParams: ['document_kind', 'node_id'],
    description:
      'ノード一つ（document_kind と node_id で識別）と、その子を軸（axis）ごとに返す。' +
      '子は list_expenditure_nodes と同じ page_size の上限と page_token で読む。' +
      '別の軸の子を同じ金額に混ぜて足さない。応答は {node, children: {<axis>: [...]}, next_page_token, origins}。',
    input: z.object({
      document_kind: z.enum(DOCUMENT_KINDS).describe('資料区分（settlement か initial）。'),
      node_id: z.string().min(1).describe('list の応答の node_id。'),
      page_size: pageSize,
      page_token: pageToken('document_kind と node_id は前回と同じにする。'),
    }),
    output: z.object({
      node: Node,
      children: z.record(z.string(), z.array(Node)),
      next_page_token: z.string().nullable(),
      origins: z.array(Origin),
    }),
    run: getNode,
  },
  {
    name: 'describe_expenditure_columns',
    summary: '列の説明と金額の和の条件',
    path: '/v1/expenditure/columns',
    pathParams: [],
    description:
      '歳出の木の列の説明（資料区分ごと）、filter・order_by に使える列、受け付ける document_kind、' +
      '金額を足すときの条件（sum_rules）を返す。filter を書く前に一度読む。' +
      REQUIRED_HELP,
    input: z.object({}),
    output: z.object({
      document_kinds: z.array(z.object({ name: z.string(), description: z.string() })),
      filter_columns: z.array(z.string()),
      order_by_columns: z.array(z.string()),
      filter_syntax: z.string(),
      required_filter: z.string(),
      sum_rules: z.array(z.string()),
      columns: z.array(
        z.object({ name: z.string(), type: z.string(), description: z.record(z.string(), z.string()) })
      ),
      origin_columns: z.array(z.object({ name: z.string(), type: z.string(), description: z.string().nullable() })),
    }),
    run: describeColumns,
  },
]
