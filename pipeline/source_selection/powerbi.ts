import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { USER_AGENT } from './download'
import type { PowerBiAcquisition } from './schema'

/**
 * Power BI の「Web に公開」レポートから、表示の元になる表を CSV にして取る。
 * 市のファイルではなく、レポートが自分で使う公開 API（modelsAndExploration・conceptualschema・querydata）への問い合わせの結果。
 * 同じデータからは同じバイト列になる（行は order_by の列で並べ、列は宣言の順）。
 */

/** 1回の問い合わせで受ける行数の上限（Power BI の Window.Count の最大）。超えて途中で終わった結果は受けない。 */
const WINDOW_COUNT = 30_000
const ATTEMPTS = 3

type ReportKey = { k: string; t: string }
export type PowerBiTable = { name: string; columns: string[]; measures: string[] }
export type PowerBiCsv = { body: Uint8Array; rows: number }

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** `https://app.powerbi.com/view?r=<base64 の {"k":resource key,"t":tenant}>` を分ける。 */
export function parseReportUrl(url: string): ReportKey {
  const parsed = new URL(url)
  const encoded = parsed.searchParams.get('r')
  if (parsed.hostname !== 'app.powerbi.com' || parsed.pathname !== '/view' || !encoded) throw new Error('Not a Power BI public report URL')
  const key = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Partial<ReportKey>
  if (typeof key.k !== 'string' || typeof key.t !== 'string' || !GUID.test(key.k) || !GUID.test(key.t)) throw new Error('Invalid Power BI report key')
  return { k: key.k, t: key.t }
}

/**
 * レポートの頁が割り当てる cluster の API の origin。頁の HTML に埋め込まれた FixedClusterUri（`wabi-…-redirect`）から、
 * 頁の script（getAPIMUrl）と同じ規則で `-redirect` と `global-` を外して `-api` を足す。cluster は固定せず、取るたびに頁から決める。
 */
export function apiOriginFromCluster(clusterUri: string): string {
  const url = new URL(clusterUri)
  const labels = url.hostname.split('.')
  labels[0] = `${labels[0]!.replace('-redirect', '').replace('global-', '')}-api`
  return `${url.protocol}//${labels.join('.')}`
}

/** 一時的な失敗（接続・429・5xx）だけ試し直す。それ以外の HTTP の失敗はすぐ返す。 */
async function request(url: string, init: RequestInit): Promise<Response> {
  let last: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await Bun.sleep(1000 * (attempt - 1))
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) })
      if (response.ok) return response
      last = new Error(`Power BI request failed (HTTP ${response.status}): ${url}`)
      if (response.status < 500 && response.status !== 429) break
    } catch (error) { last = error }
  }
  throw last
}

async function resolveApiOrigin(reportUrl: string): Promise<string> {
  const html = await (await request(reportUrl, { headers: { 'user-agent': USER_AGENT } })).text()
  const cluster = html.match(/"FixedClusterUri":"(https:\/\/[^"]+)"/)?.[1]
  if (!cluster) throw new Error('Report page has no FixedClusterUri')
  return apiOriginFromCluster(cluster)
}

type ApiContext = { origin: string; key: string }

async function api<T>(context: ApiContext, path: string, body?: unknown): Promise<T> {
  const response = await request(`${context.origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'user-agent': USER_AGENT, 'x-powerbi-resourcekey': context.key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return await response.json() as T
}

type Property = { Name: string; Column?: unknown; Measure?: unknown }

async function loadModel(reportUrl: string) {
  const { k } = parseReportUrl(reportUrl)
  const context = { origin: await resolveApiOrigin(reportUrl), key: k }
  const { models } = await api<{ models: { id: number; dbName: string }[] }>(context, `/public/reports/${k}/modelsAndExploration?preferReadOnlySession=true`)
  if (models.length !== 1) throw new Error(`Expected one model, got ${models.length}`)
  const model = models[0]!
  const { schemas } = await api<{ schemas: { schema: { Entities: { Name: string; Properties: Property[] }[] } }[] }>(
    context, '/public/reports/conceptualschema', { modelIds: [model.id], userPreferredLocale: 'ja-JP' })
  const tables: PowerBiTable[] = schemas[0]!.schema.Entities.map(entity => ({
    name: entity.Name,
    columns: entity.Properties.filter(property => property.Column).map(property => property.Name),
    measures: entity.Properties.filter(property => property.Measure).map(property => property.Name),
  }))
  return { context, model, tables }
}

/** レポートのデータモデルの表と、その列・measure。取得の宣言を決めるための調査用。 */
export async function listTables(reportUrl: string): Promise<PowerBiTable[]> {
  return (await loadModel(reportUrl)).tables
}

type Schema = { N: string; T: number; DN?: string }
type Row = { S?: Schema[]; C?: unknown[]; R?: number | string; 'Ø'?: number | string }
export type DataShape = { IC?: boolean; ValueDicts?: Record<string, string[]>; PH?: { DM0?: Row[] }[] }
export type Cell = string | number | boolean | null

/** DSR（圧縮した結果）を行に戻す。R は直前の行と同じ列、Ø は null の列の bitmask（列の数が 32 を超えるので BigInt）、C は残りの列の値を順に並べたもの。 */
export function decodeDataShape(shape: DataShape): Cell[][] {
  if (shape.IC !== true) throw new Error('Power BI returned an incomplete result')
  const rows = shape.PH?.[0]?.DM0 ?? []
  let schema: Schema[] | undefined
  let previous: Cell[] = []
  const decoded: Cell[][] = []
  for (const row of rows) {
    schema = row.S ?? schema
    if (!schema) throw new Error('Result row has no schema')
    const repeated = BigInt(row.R ?? 0)
    const nulls = BigInt(row['Ø'] ?? 0)
    const values = [...(row.C ?? [])]
    const cells = schema.map((column, index): Cell => {
      const bit = 1n << BigInt(index)
      if (nulls & bit) return null
      if (repeated & bit) return previous[index] ?? null
      const raw = values.shift()
      if (raw === undefined) throw new Error('Result row has fewer values than columns')
      if (column.DN !== undefined && typeof raw === 'number') {
        const text = shape.ValueDicts?.[column.DN]?.[raw]
        if (text === undefined) throw new Error(`Value dictionary ${column.DN} has no entry ${raw}`)
        return text
      }
      if (raw === null || typeof raw === 'boolean') return raw
      // 数は number、64bit 整数・小数は `123L`・`1.5M` のような文字で来ることがある。日時（T=7）は epoch ms
      if (typeof raw === 'number') return column.T === 7 ? new Date(raw).toISOString() : raw
      const text = String(raw)
      const numeric = column.T !== 1 ? text.match(/^(-?\d+(?:\.\d+)?)[LMD]$/) : null
      return numeric ? Number(numeric[1]) : text
    })
    if (values.length) throw new Error('Result row has more values than columns')
    decoded.push(cells)
    previous = cells
  }
  return decoded
}

function compareCells(a: Cell, b: Cell): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const left = String(a)
  const right = String(b)
  return left < right ? -1 : left > right ? 1 : 0
}

const needsQuote = /[",\r\n]/

/** RFC 4180。UTF-8・LF・ヘッダ行あり・末尾も LF。null は空、値の中の改行は LF にそろえる。 */
export function toCsv(columns: string[], rows: Cell[][]): string {
  const field = (cell: Cell) => {
    const text = cell === null ? '' : String(cell).replace(/\r\n?/g, '\n')
    return needsQuote.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return [columns, ...rows].map(row => row.map(cell => field(cell as Cell)).join(',') + '\n').join('')
}

export function buildQuery(model: { id: number; dbName: string }, table: string, columns: string[]) {
  const reference = (property: string) => ({ Column: { Expression: { SourceRef: { Source: 't' } }, Property: property } })
  return {
    version: '1.0.0',
    queries: [{
      Query: { Commands: [{ SemanticQueryDataShapeCommand: {
        Query: { Version: 2, From: [{ Name: 't', Entity: table, Type: 0 }], Select: columns.map(column => ({ ...reference(column), Name: `t.${column}` })) },
        Binding: {
          Primary: { Groupings: [{ Projections: columns.map((_, index) => index) }] },
          DataReduction: { DataVolume: 4, Primary: { Window: { Count: WINDOW_COUNT } } },
          Version: 1,
        },
        ExecutionMetricsKind: 1,
      } }] },
      QueryId: '',
      ApplicationContext: { DatasetId: model.dbName, Sources: [] },
    }],
    cancelQueries: [],
    modelId: model.id,
  }
}

/**
 * 宣言した表・列を問い合わせて CSV にする。列が表に無い（年度で列名が変わった、measure だった）ときと、
 * 並びの列が行を一意に決めない（同じ値の行が1行にまとめられて返る）ときは止める。
 */
export async function fetchPowerBiCsv(reportUrl: string, acquisition: PowerBiAcquisition): Promise<PowerBiCsv> {
  const { context, model, tables } = await loadModel(reportUrl)
  const table = tables.find(candidate => candidate.name === acquisition.table)
  if (!table) throw new Error(`Table not found: ${acquisition.table}`)
  const missing = acquisition.columns.filter(column => !table.columns.includes(column))
  if (missing.length) throw new Error(`Columns not found in ${acquisition.table}: ${missing.join(', ')}`)
  const response = await api<{ results: { result: { data: { dsr: { DS: DataShape[]; DataShapes?: unknown } } } }[] }>(
    context, '/public/reports/querydata?synchronous=true', buildQuery(model, acquisition.table, acquisition.columns))
  const shape = response.results[0]?.result.data.dsr.DS[0]
  if (!shape) throw new Error('Power BI returned no data')
  const rows = decodeDataShape(shape)
  if (rows.length === 0) throw new Error('Power BI returned no rows')
  if (rows.some(row => row.length !== acquisition.columns.length)) throw new Error('Result columns differ from the declared columns')
  const orderIndexes = acquisition.order_by.map(column => acquisition.columns.indexOf(column))
  if (orderIndexes.includes(-1)) throw new Error('order_by must be among columns')
  rows.sort((a, b) => {
    for (const index of orderIndexes) {
      const order = compareCells(a[index]!, b[index]!)
      if (order) return order
    }
    return 0
  })
  const keys = new Set(rows.map(row => JSON.stringify(orderIndexes.map(index => row[index]))))
  if (keys.size !== rows.length) throw new Error('order_by does not identify rows uniquely')
  return { body: new TextEncoder().encode(toCsv(acquisition.columns, rows)), rows: rows.length }
}

const USAGE = `Usage: bun pipeline/source_selection/powerbi.ts <report-url> --schema
       bun pipeline/source_selection/powerbi.ts <report-url> --table <name> (--columns <JSON array> | --all-columns) --order-by <JSON array> --out <path>
Power BI の「Web に公開」レポートの表を CSV にして --out に書き、選定に写す値を1行の JSON で返す。--schema は表・列・measure の一覧。
--all-columns は表の measure でない列を、データモデルの順にすべて取る。--columns の JSON array は列名の配列。
風土記と名乗る User-Agent でレポートの公開 API に問い合わせる。sandbox の外で回す。`

async function main(args: string[]) {
  if (args.includes('--help') || args.length === 0) { console.log(USAGE); return }
  let url: string | undefined
  let table: string | undefined
  let columns: string[] | undefined
  let orderBy: string[] | undefined
  let out: string | undefined
  let allColumns = false
  let schema = false
  const list = (value: string | undefined) => {
    const parsed: unknown = JSON.parse(value ?? 'null')
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('Expected a JSON array of strings')
    return parsed as string[]
  }
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? ''
    const value = args[index + 1]
    if (arg === '--table' && value) { table = value; index++ }
    else if (arg === '--columns' && value) { columns = list(value); index++ }
    else if (arg === '--order-by' && value) { orderBy = list(value); index++ }
    else if (arg === '--out' && value) { out = value; index++ }
    else if (arg === '--all-columns') allColumns = true
    else if (arg === '--schema') schema = true
    else if (!url && !arg.startsWith('--')) url = arg
    else throw new Error(`Unknown or incomplete argument: ${arg}`)
  }
  if (!url) throw new Error('report url is required')
  if (schema) { console.log(JSON.stringify(await listTables(url))); return }
  if (!table || !orderBy || !out || (!columns && !allColumns) || (columns && allColumns)) throw new Error('--table, --order-by, --out and one of --columns / --all-columns are required')
  if (allColumns) {
    const found = (await listTables(url)).find(candidate => candidate.name === table)
    if (!found) throw new Error(`Table not found: ${table}`)
    columns = found.columns
  }
  const acquisition: PowerBiAcquisition = { type: 'powerbi', table, columns: columns!, order_by: orderBy }
  const csv = await fetchPowerBiCsv(url, acquisition)
  const path = resolve(out)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, csv.body)
  console.log(JSON.stringify({
    download_url: url, acquisition, rows: csv.rows, bytes: csv.body.byteLength,
    sha256: createHash('sha256').update(csv.body).digest('hex'), out: path,
  }))
}

if (import.meta.main) main(Bun.argv.slice(2)).catch(error => { console.error(JSON.stringify({ error: String(error) })); process.exitCode = 1 })
