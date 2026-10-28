import { z } from 'zod'
import { NODE_TABLES, type ColumnSpec, type NodeTable } from './columns'
import { invalid } from './errors'

// 構造化した問い合わせ入力（ADR 0022）。列名は許可列の enum からだけ、値はすべて bind し、SQL に連結しない。
// 文字列の構文解析を持たない。列どうしは AND、eq の配列の中は OR（IN）。

export const MAX_LIST = 100 // eq / not_eq の個数
export const MAX_TEXT = 200 // 文字列の長さ
export const MAX_BINDS = 90 // fiscal_year（IN の年）と where の bind の総数。D1 は1文の bind が100までで、LIMIT・OFFSET に2つ使う
export const MAX_GLOB_BYTES = 50 // D1 の GLOB のパターンは50バイトまで
export const MAX_OFFSET = 100_000 // page_token の位置の上限。走査する行を抑える
export const MAX_YEARS = 5
export const MAX_ORDER_KEYS = 5
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

const oneOrMore = (o: object) => Object.values(o).some((v) => v !== undefined)
const KEYS_MESSAGE = '条件のキーが1つ以上必要です'

// NUL を含む制御文字は拒否する（GLOB は NUL 以降を無視して意図しない一致になる）
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/
const text = z.string().max(MAX_TEXT).regex(NO_CONTROL, '制御文字は使えません')
const strings = z.array(text).min(1).max(MAX_LIST)
const part = text.min(1)
const ints = z.array(z.int()).min(1).max(MAX_LIST)

// meta の id で、33 列に同じ条件の schema が繰り返し出ないよう $defs に一度だけ出す（tools/list を小さくする）。
const stringCondition = z
  .strictObject({
    eq: strings.optional().describe('Equal to any value (OR)'),
    not_eq: strings.optional().describe('Not equal to any listed value'),
    prefix: part.optional().describe('Starts with'),
    suffix: part.optional().describe('Ends with'),
    contains: part.optional().describe('Contains'),
    is_null: z.boolean().optional().describe('true matches NULL; false matches non-NULL'),
  })
  .refine(oneOrMore, KEYS_MESSAGE)
  .meta({ id: 'StringCondition' })

const integerCondition = z
  .strictObject({
    eq: ints.optional(),
    not_eq: ints.optional(),
    min: z.int().optional().describe('Inclusive minimum'),
    max: z.int().optional().describe('Inclusive maximum'),
    is_null: z.boolean().optional(),
  })
  .refine(oneOrMore, KEYS_MESSAGE)
  .meta({ id: 'IntegerCondition' })

const numberCondition = z
  .strictObject({
    min: z.number().optional().describe('Inclusive minimum'),
    max: z.number().optional().describe('Inclusive maximum'),
    is_null: z.boolean().optional(),
  })
  .refine(oneOrMore, KEYS_MESSAGE)
  .meta({ id: 'NumberCondition' })

const booleanCondition = z.strictObject({ eq: z.boolean() }).meta({ id: 'BooleanCondition' })

export const conditionOf = (type: ColumnSpec['type']) =>
  type === 'string'
    ? stringCondition
    : type === 'integer'
      ? integerCondition
      : type === 'number'
        ? numberCondition
        : booleanCondition

type Condition = Record<string, unknown>

/** 条件が bind する値の数 */
function bindsOf(c: Condition): number {
  let n = 0
  for (const [key, v] of Object.entries(c)) {
    if (v === undefined || key === 'is_null') continue
    n += Array.isArray(v) ? v.length : 1
  }
  return n
}

export function countBinds(
  fiscalYear: { min: number; max: number },
  where: Record<string, Condition | undefined> | undefined
): number {
  let n = Math.max(0, fiscalYear.max - fiscalYear.min + 1) // fiscal_year の IN
  for (const c of Object.values(where ?? {})) if (c !== undefined) n += bindsOf(c)
  return n
}

/** GLOB の特殊文字 `* ? [` を `[*]` `[?]` `[[]` にする。BINARY の index が前方一致に効き、等値と同じ大文字小文字の区別になる。 */
export const globEscape = (text: string) => text.replace(/[*?[]/g, (m) => `[${m}]`)

/** fiscal_year の範囲と where を、値を bind した WHERE に組み立てる。 */
export function buildWhere(
  t: NodeTable,
  fiscalYear: { min: number; max: number },
  where: Record<string, Condition | undefined> | undefined
): { sql: string; params: (string | number)[] } {
  // 範囲（>= AND <=）にすると複合 index の後続の列が効かないので、幅が5年以内の年を IN に展開する。
  const years = Array.from({ length: Math.min(MAX_YEARS, Math.max(0, fiscalYear.max - fiscalYear.min + 1)) }, (_, i) => fiscalYear.min + i)
  const parts = [`"fiscal_year" IN (${years.map(() => '?').join(', ')})`]
  const params: (string | number)[] = [...years]
  const bind = (column: string, op: string, value: string | number) => {
    parts.push(`"${column}" ${op} ?`)
    params.push(value)
  }
  const glob = (column: string, pattern: string) => {
    // 生成後（escape と前後の * を含む）の UTF-8 バイト数で数える
    if (new TextEncoder().encode(pattern).length > MAX_GLOB_BYTES)
      throw invalid(`${column} の prefix・suffix・contains は escape 後に ${MAX_GLOB_BYTES} バイト以内にしてください（* ? [ は 3 バイトになります）`)
    bind(column, 'GLOB', pattern)
  }
  for (const [column, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue
    const type = t.types.get(column)
    if (type === undefined || column === 'fiscal_year') throw invalid(`where に使えない列です: ${column}`)
    const list = (key: 'eq' | 'not_eq', negate: boolean) => {
      const values = cond[key] as (string | number)[] | undefined
      if (values === undefined) return
      parts.push(`"${column}" ${negate ? 'NOT IN' : 'IN'} (${values.map(() => '?').join(', ')})`)
      params.push(...values)
    }
    if (type === 'boolean') {
      bind(column, '=', cond.eq ? 1 : 0)
      continue
    }
    if (cond.is_null !== undefined) parts.push(`"${column}" IS ${cond.is_null ? '' : 'NOT '}NULL`)
    if (type === 'string' || type === 'integer') {
      list('eq', false)
      list('not_eq', true)
    }
    if (type === 'string') {
      if (cond.prefix !== undefined) glob(column, `${globEscape(cond.prefix as string)}*`)
      if (cond.suffix !== undefined) glob(column, `*${globEscape(cond.suffix as string)}`)
      if (cond.contains !== undefined) glob(column, `*${globEscape(cond.contains as string)}*`)
    } else {
      if (cond.min !== undefined) bind(column, '>=', cond.min as number)
      if (cond.max !== undefined) bind(column, '<=', cond.max as number)
    }
  }
  return { sql: parts.join(' AND '), params }
}

/** キーを並べ替えた JSON。page_token の指紋に使う。入力は schema を通った有限の深さの JSON。 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

const anyTable = NODE_TABLES.values().next().value as NodeTable
const columnNames = anyTable.columns.map((c) => c.name) as [string, ...string[]]

const whereSchema = z.strictObject(
  Object.fromEntries(
    anyTable.columns.filter((c) => c.name !== 'fiscal_year').map((c) => [c.name, conditionOf(c.type).optional()])
  )
)

const DOCUMENT_KIND_LIST = [...NODE_TABLES.keys()] as [string, ...string[]]

export const searchInput = z
  .strictObject({
    document_kind: z.enum(DOCUMENT_KIND_LIST).describe('Required document kind selecting the table: settlement (executed expenditure) or initial (initial budget).'),
    fiscal_year: z
      .strictObject({
        min: z.int().min(1).max(9999),
        max: z.int().min(1).max(9999),
      })
      .describe(`Required fiscal year range in Gregorian years, spanning at most ${MAX_YEARS} years (max - min <= ${MAX_YEARS - 1}).`),
    where: whereSchema.optional().describe('Conditions per column, combined with AND.'),
    order_by: z
      .array(
        z.strictObject({
          column: z.enum(columnNames),
          desc: z.boolean().optional(),
        })
      )
      .max(MAX_ORDER_KEYS)
      .optional()
      .describe('Sort order; node_id is appended as a tie breaker.'),
    page_size: z.int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Number of results per page.'),
    page_token: z.string().max(512).regex(/^[A-Za-z0-9_-]*$/, 'page_token の形式が不正です').optional().describe('next_page_token from the previous response. Keep all input except page_size unchanged.'),
  })
  .superRefine((v, ctx) => {
    if (v.fiscal_year.max < v.fiscal_year.min)
      ctx.addIssue({ code: 'custom', path: ['fiscal_year'], message: 'fiscal_year は max >= min にしてください' })
    else if (v.fiscal_year.max - v.fiscal_year.min + 1 > MAX_YEARS)
      ctx.addIssue({ code: 'custom', path: ['fiscal_year'], message: `fiscal_year は ${MAX_YEARS} 年以内にしてください` })
    const binds = countBinds(v.fiscal_year, v.where as Record<string, Condition | undefined> | undefined)
    if (binds > MAX_BINDS)
      ctx.addIssue({ code: 'custom', path: ['where'], message: `年と条件の値の合計は ${MAX_BINDS} 個までです（今 ${binds} 個）` })
    const seen = new Set<string>()
    for (const k of v.order_by ?? []) {
      if (seen.has(k.column)) ctx.addIssue({ code: 'custom', path: ['order_by'], message: `order_by に同じ列が複数あります: ${k.column}` })
      seen.add(k.column)
    }
  })

export type SearchInput = z.output<typeof searchInput>
