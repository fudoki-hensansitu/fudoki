import { z } from 'zod'
import columnsJson from './columns.json'

export type ColumnType = 'string' | 'integer' | 'number' | 'boolean'

// columns.json は pipeline/serving の生成物（D1 の表と列の契約）。手で編集しない。
// 表は marts と同名で、木の表は document_kind を持つ（表の列としては持たない）。
export interface ColumnSpec {
  name: string
  type: ColumnType
  description: string | null
  /** 欠けているときは null になり得るものとして扱う */
  nullable?: boolean
}

interface TableSpec {
  document_kind?: string
  columns: ColumnSpec[]
}

const TABLES = (columnsJson as unknown as { tables: Record<string, TableSpec> }).tables

export interface NodeTable {
  documentKind: string
  table: string
  columns: ColumnSpec[]
  types: ReadonlyMap<string, ColumnType>
  selectList: string
}

/** 資料区分から木の表を選ぶ。補正予算は表がまだ無いので受け付けない。 */
export const NODE_TABLES: ReadonlyMap<string, NodeTable> = new Map(
  Object.entries(TABLES)
    .filter(([, t]) => t.document_kind !== undefined)
    .map(([table, t]) => [
      t.document_kind!,
      {
        documentKind: t.document_kind!,
        table,
        columns: t.columns,
        types: new Map(t.columns.map((c) => [c.name, c.type])),
        selectList: t.columns.map((c) => `"${c.name}"`).join(', '),
      },
    ])
)

export const DOCUMENT_KINDS = [...NODE_TABLES.keys()] as [string, ...string[]]

export const ORIGIN_TABLE = 'origin'
export const ORIGIN_COLUMNS = TABLES[ORIGIN_TABLE]!.columns
export const ORIGIN_SELECT_LIST = ORIGIN_COLUMNS.map((c) => `"${c.name}"`).join(', ')

export const DOCUMENT_KIND_DESCRIPTION =
  '資料区分。settlement は決算（金額は支出済額）、initial は当初予算（金額は当初予算額）。意味の違う金額を足さない。'

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
