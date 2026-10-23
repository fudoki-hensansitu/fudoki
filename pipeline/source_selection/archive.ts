import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluationSelectionsSchema, jurisdictionSelectionsSchema, sourceSelectionsSchema, targetKey, type ArchivedOrigin, type PowerBiAcquisition, type SourceTarget } from './schema'
import { downloadOriginal, MAX_BYTES } from './download'
import { fetchPowerBiCsv } from './powerbi'
import { ARCHIVE_BUCKET, evaluationObjectKey, evaluationObjectSlot, originObjectKey, originObjectSlot } from './storage'

const digest = (body: Uint8Array) => createHash('sha256').update(body).digest('hex')

/** 取得したバイト列が宣言した形式か。出典の URL が失効した跡地は、404 ではなく「見つかりませんでした」とリニューアルの案内を HTML で 200 に返すことがある（2026-10-20 の品川区）。 */
export function matchesDeclaredFormat(body: Uint8Array, format: 'csv' | 'pdf'): boolean {
  // UTF-8 の BOM は latin1 では "ï»¿" になるので、文字ではなくバイトで飛ばす
  const start = body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf ? 3 : 0
  const decoded = new TextDecoder('latin1').decode(body.subarray(start, start + 1024))
  // PDF のヘッダは先頭 1024 バイト以内にあればよい（先頭に余分なバイトを持つ PDF がある）
  if (format === 'pdf') return decoded.includes('%PDF-')
  // CSV の宣言で HTML・XML・JSON の本文を保存しない（跡地やエラーの応答）
  const head = decoded.trimStart().toLowerCase()
  return !(head.startsWith('<') || head.startsWith('{') || head.startsWith('['))
}

async function saveSelections(path: string, data: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n')
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

export type ArchiveTransport = {
  /** acquisition があるファイルは、url のレポートへ問い合わせた結果を返す（ダウンロードではない）。 */
  download(url: string, acquisition?: PowerBiAcquisition): Promise<{ body: Uint8Array; final_url: string }>
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  list(prefix: string): Promise<string[]>
  remove(key: string): Promise<void>
}

/** 保存の計画が見る選定の形。決算書の選定（scope 付き）と評価資料の選定（pages 付き）が共通で満たす。 */
export type ArchiveFile = { download_url: string; sha256: string | null; format: 'csv' | 'pdf'; acquisition?: PowerBiAcquisition }
export type ArchiveSelection = {
  target: SourceTarget
  candidates: { id: string; files: ArchiveFile[] }[]
  selected_candidate_id: string | null
  archive: ArchivedOrigin | null
}

/** 保存する資料の種類ごとの違い。選定の検査・slot と key・選定ファイルの置き場所だけで、計画と保存の手順は共通。 */
export type ArchiveKind = {
  /** 選定ファイルの中でこの種類の選定を持つ field。 */
  field: 'selections' | 'evaluation_selections'
  formats: ('csv' | 'pdf')[]
  parse(selections: ArchiveSelection[]): void
  slot(target: SourceTarget): string
  key(target: SourceTarget, format: 'csv' | 'pdf', index?: number): string
}

export const settlementKind: ArchiveKind = {
  field: 'selections',
  formats: ['csv', 'pdf'],
  parse: selections => { sourceSelectionsSchema.parse(selections) },
  slot: originObjectSlot,
  key: originObjectKey,
}

function settlementTarget(target: SourceTarget) {
  if (target.document_kind !== 'settlement') throw new Error('Evaluation originals belong to a settlement target')
  return target
}

export const evaluationKind: ArchiveKind = {
  field: 'evaluation_selections',
  formats: ['csv', 'pdf'],
  parse: selections => { evaluationSelectionsSchema.parse(selections) },
  slot: target => evaluationObjectSlot(settlementTarget(target)),
  key: (target, format, index) => evaluationObjectKey(settlementTarget(target), format, index),
}

/** 同じ保存範囲のファイルを、確認済みバイト列ごとに共有する。 */
export function planFiles(group: ArchiveSelection[], previous?: ArchiveSelection, nextPart?: number, kind: ArchiveKind = settlementKind): { file: ArchiveFile; key: string }[] {
  if (!group.length) throw new Error('Empty archive group')
  kind.parse(group)
  const slot = kind.slot(group[0]!.target)
  const byHash = new Map<string, ArchiveFile>()
  const urls = new Map<string, string>()
  for (const selection of group) {
    if (selection.selected_candidate_id === null || kind.slot(selection.target) !== slot) throw new Error('Expected one selected document group')
    const candidate = selection.candidates.find(item => item.id === selection.selected_candidate_id)!
    for (const file of candidate.files) {
      if (file.sha256 === null) throw new Error('Selected file needs inspected byte identity')
      const previous = urls.get(file.download_url)
      if (previous && previous !== file.sha256) throw new Error('Conflicting byte identities for the same URL')
      urls.set(file.download_url, file.sha256)
      const same = byHash.get(file.sha256)
      if (same && same.format !== file.format) throw new Error('Conflicting formats for the same bytes')
      if (!same || file.download_url < same.download_url) byHash.set(file.sha256, file)
    }
  }
  const files = [...byHash.values()].sort((a, b) => a.sha256!.localeCompare(b.sha256!))
  const receipts = retainedReceipts(group, previous, kind)
  const highest = Math.max(0, ...[...receipts.values()].map(item => Number(item.key.slice(slot.length).match(/^-(\d+)\./)?.[1] ?? 0)))
  if (nextPart !== undefined && (!previous || !Number.isSafeInteger(nextPart) || nextPart <= highest || !files.some(file => !receipts.has(file.sha256!)))) {
    throw new Error('next-part requires new replacement bytes and an integer above the saved part numbers')
  }
  let next = nextPart === undefined ? highest : nextPart - 1
  const planned = files.map((file, index) => ({ file, key: receipts.get(file.sha256!)?.key ?? kind.key(
    group[0]!.target, file.format, receipts.size ? ++next : files.length === 1 ? undefined : index + 1) }))
  const keys = planned.map(item => item.key)
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate planned original key')
  // Validate the future receipt before performing any transfer (including single-key/part changes).
  for (const selection of group) {
    const candidate = selection.candidates.find(item => item.id === selection.selected_candidate_id)!
    kind.parse([{ ...selection, archive: { bucket: ARCHIVE_BUCKET, candidate_id: candidate.id,
      archived_at: new Date().toISOString(), files: candidate.files.map(file => ({ key: planned.find(item => item.file.sha256 === file.sha256)!.key,
        sha256: file.sha256!, final_url: file.download_url })) } }])
  }
  return planned
}

function retainedReceipts(group: ArchiveSelection[], previous?: ArchiveSelection, kind: ArchiveKind = settlementKind) {
  if (previous) {
    kind.parse([previous])
    if (group.length !== 1 || targetKey(previous.target) !== targetKey(group[0]!.target) || !previous.archive) {
      throw new Error('Replacement requires the same archived target')
    }
  }
  const receipts = new Map<string, { key: string; sha256: string; final_url: string }>()
  const keys = new Set<string>()
  const formats = new Map<string, string>()
  for (const selection of [...group, ...(previous ? [previous] : [])]) {
    const candidate = selection.candidates.find(item => item.id === selection.selected_candidate_id)
    for (const file of candidate?.files ?? []) {
      const format = formats.get(file.sha256!)
      if (format && format !== file.format) throw new Error('Conflicting formats for retained bytes')
      formats.set(file.sha256!, file.format)
    }
    for (const receipt of selection.archive?.files ?? []) {
      const saved = receipts.get(receipt.sha256)
      if (saved && saved.key !== receipt.key) throw new Error('Conflicting retained keys for the same bytes')
      if (!saved && keys.has(receipt.key)) throw new Error('Duplicate retained original key')
      keys.add(receipt.key)
      receipts.set(receipt.sha256, receipt)
    }
  }
  if (previous) {
    const selected = group[0]!.candidates.find(item => item.id === group[0]!.selected_candidate_id)!
    const hashes = new Set(selected.files.map(file => file.sha256))
    if (previous.archive!.files.some(receipt => !hashes.has(receipt.sha256))) throw new Error('Replacement must retain previously archived files')
  }
  return receipts
}

export function planArchives<S extends ArchiveSelection>(selections: S[], kind: ArchiveKind = settlementKind): S[][] {
  kind.parse(selections)
  const groups = selections.filter(selection => selection.selected_candidate_id !== null).map(selection => [selection])
  for (const group of groups) planFiles(group, undefined, undefined, kind)
  return groups
}

export function isArchived(group: ArchiveSelection[], previous?: ArchiveSelection, nextPart?: number, kind: ArchiveKind = settlementKind): boolean {
  const keys = new Map(planFiles(group, previous, nextPart, kind).map(item => [item.file.sha256!, item.key]))
  return group.every(selection => {
    if (selection.selected_candidate_id === null || selection.archive === null) return false
    const candidate = selection.candidates.find(item => item.id === selection.selected_candidate_id)!
    return selection.archive.candidate_id === candidate.id && selection.archive.files.length === candidate.files.length &&
      candidate.files.every((file, index) => selection.archive!.files[index]!.sha256 === file.sha256 && selection.archive!.files[index]!.key === keys.get(file.sha256!))
  })
}

export async function archiveSelected<S extends ArchiveSelection>(selection: S, transport: ArchiveTransport, kind: ArchiveKind = settlementKind): Promise<S> {
  kind.parse([selection])
  if (selection.selected_candidate_id === null) return selection
  return (await archiveGroup([selection], transport, undefined, undefined, kind))[0]!
}

/** 全ファイルの取得内容を照合し、アップロードと不要ファイルの削除が成功してから記録する。 */
export async function archiveGroup<S extends ArchiveSelection>(group: S[], transport: ArchiveTransport, previous?: ArchiveSelection, nextPart?: number, kind: ArchiveKind = settlementKind): Promise<S[]> {
  const groups = planArchives(group, kind)
  if (groups.length !== 1 || groups[0]!.length !== group.length) throw new Error('Expected one selected document group')
  if (isArchived(group, previous, nextPart, kind)) return group
  const planned = planFiles(group, previous, nextPart, kind)
  const retained = retainedReceipts(group, previous, kind)
  const prefix = kind.slot(group[0]!.target) + '-'
  const previousKeys = await transport.list(prefix)
  if (previousKeys.some(key => !key.startsWith(prefix))) throw new Error('Object listing escaped the requested prefix')
  if (previous && planned.some(item => !retained.has(item.file.sha256!) && previousKeys.includes(item.key))) throw new Error('New original key already exists; refusing overwrite')
  const directory = await mkdtemp(join(tmpdir(), 'fudoki-origin-parts-'))
  try {
    const downloaded = []
    for (const item of planned) {
      if (retained.has(item.file.sha256!)) continue
      const response = await transport.download(item.file.download_url, item.file.acquisition)
      if (digest(response.body) !== item.file.sha256) throw new Error(`Original changed; inspect and reselect before archiving: ${item.file.download_url}`)
      if (!matchesDeclaredFormat(response.body, item.file.format)) throw new Error(`Original is not a ${item.file.format.toUpperCase()}; inspect and reselect before archiving: ${item.file.download_url}`)
      if (response.body.byteLength > MAX_BYTES) throw new Error('Original exceeds the cf upload size limit')
      const path = join(directory, String(downloaded.length))
      await writeFile(path, response.body)
      downloaded.push({ ...item, path, final_url: response.final_url })
    }
    for (const item of downloaded) await transport.put(item.key, await readFile(item.path), item.file.format === 'pdf' ? 'application/pdf' : 'text/csv')
    const keep = new Set(planned.map(item => item.key))
    const oldKeys = new Set([...previousKeys, ...kind.formats.map(format => kind.key(group[0]!.target, format))])
    if (!previous) for (const key of oldKeys) if (!keep.has(key)) await transport.remove(key)
    const saved = new Map([...retained, ...downloaded.map(item => [item.file.sha256!, { key: item.key, sha256: item.file.sha256!, final_url: item.final_url }] as const)])
    const archived_at = new Date().toISOString()
    const result = group.filter(selection => selection.selected_candidate_id !== null).map(selection => {
      const candidate = selection.candidates.find(item => item.id === selection.selected_candidate_id)!
      return { ...selection, archive: { bucket: ARCHIVE_BUCKET, candidate_id: candidate.id, files: candidate.files.map(file => saved.get(file.sha256!)!), archived_at } }
    })
    kind.parse(result)
    return result
  } finally { await rm(directory, { recursive: true, force: true }) }
}

export function isMissingR2ObjectError(stderr: string): boolean {
  return /(?:HTTP(?: status)?[ :]+404|404 Not Found|"status"\s*:\s*404|NoSuchKey|\[10007\]\s+The specified key does not exist\.)/i.test(stderr)
}

async function runCf(args: string[], allowMissing = false, capture = false): Promise<string> {
  const process = Bun.spawn(['cf', 'r2', 'objects', ...args, '--bucket-name', ARCHIVE_BUCKET, '--quiet'], {
    stdout: capture ? 'pipe' : 'ignore', stderr: 'pipe',
  })
  const [stderr, stdout, status] = await Promise.all([
    new Response(process.stderr).text(), capture ? new Response(process.stdout).text() : Promise.resolve(''), process.exited,
  ])
  if (status !== 0 && !(allowMissing && isMissingR2ObjectError(stderr))) throw new Error(`cf R2 ${args[0]} failed (exit ${status})`)
  return stdout
}

const cfTransport: ArchiveTransport = {
  async download(url, acquisition) {
    if (acquisition) return { body: (await fetchPowerBiCsv(url, acquisition)).body, final_url: url }
    const { body, final_url } = await downloadOriginal(url)
    return { body, final_url }
  },
  async put(key, body, contentType) {
    const directory = await mkdtemp(join(tmpdir(), 'fudoki-origin-'))
    try {
      const path = join(directory, 'origin')
      await writeFile(path, body)
      await runCf(['put', key, '--file', path, '--content-type', contentType])
    } finally { await rm(directory, { recursive: true, force: true }) }
  },
  async list(prefix) {
    const keys: string[] = []
    let after: string | undefined
    for (;;) {
      const args = ['list', '--prefix', prefix, '--per-page', '1000']
      if (after) args.push('--start-after', after)
      const page: unknown = JSON.parse(await runCf(args, false, true))
      if (!Array.isArray(page) || page.some(item => typeof item?.key !== 'string')) throw new Error('Invalid cf object metadata response')
      const current: string[] = page.map(item => item.key).sort()
      if (current.some(key => !key.startsWith(prefix) || (after !== undefined && key <= after))) throw new Error('Invalid object listing boundary')
      keys.push(...current)
      if (current.length < 1000) return keys
      after = current.at(-1)!
    }
  },
  async remove(key) { await runCf(['delete', key, '--force'], true) },
}

async function main(args: string[]) {
  if (args.includes('--help')) {
    console.log('Usage: bun pipeline/source_selection/archive.ts [--write] [--evaluation] [--jurisdiction CODE] [--replacement-selection JSON] [--next-part N]\nDefault: read-only selected-original plan. --evaluation targets only the evaluation_selections (keys evaluation-settlement[-N].pdf|csv; a csv with an acquisition is fetched from the Power BI report, not downloaded) and leaves settlement originals untouched; without it evaluation_selections are never touched. JSON is a file containing one existing source-selection schema object with archive:null. Replacement retains the same target\'s saved files and keys, uploads only new bytes at the next part number, and saves the selection after all receipts succeed; it never deletes old objects. Optional --next-part requires replacement and sets the first new part number above all saved receipt numbers; plan and write use the same argument, and existing objects still cause an error. Without replacement, --write preserves the existing archive flow. No readback.')
    return
  }
  let write = false
  let jurisdiction: string | undefined
  let replacementPath: string | undefined
  let nextPart: number | undefined
  let evaluation = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--write' && !write) write = true
    else if (args[index] === '--evaluation' && !evaluation) evaluation = true
    else if (args[index] === '--jurisdiction' && /^\d{6}$/.test(args[index + 1] ?? '') && !jurisdiction) jurisdiction = args[++index]
    else if (args[index] === '--replacement-selection' && args[index + 1] && !replacementPath) replacementPath = args[++index]
    else if (args[index] === '--next-part' && /^[1-9]\d*$/.test(args[index + 1] ?? '') && nextPart === undefined) nextPart = Number(args[++index])
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`)
  }
  if (nextPart !== undefined && (!replacementPath || !Number.isSafeInteger(nextPart))) throw new Error('next-part requires replacement and a positive safe integer')
  const kind = evaluation ? evaluationKind : settlementKind
  const replacement: ArchiveSelection | undefined = replacementPath ? JSON.parse(await readFile(replacementPath, 'utf8')) : undefined
  if (replacement) kind.parse([replacement])
  if (replacement) {
    if (replacement.selected_candidate_id === null || replacement.archive !== null) throw new Error('Replacement must be selected with archive:null')
    if (jurisdiction && jurisdiction !== replacement.target.jurisdiction) throw new Error('Replacement jurisdiction differs from requested jurisdiction')
    jurisdiction = replacement.target.jurisdiction
  }
  const names = (await readdir(import.meta.dir)).filter(name => /^\d{6}\.json$/.test(name) && (!jurisdiction || name === `${jurisdiction}.json`)).sort()
  if (!names.length) throw new Error('No matching jurisdiction file')
  const files = await Promise.all(names.map(async name => ({
    path: join(import.meta.dir, name),
    data: jurisdictionSelectionsSchema.parse(JSON.parse(await readFile(join(import.meta.dir, name), 'utf8'))),
  })))
  // 選定ファイルの中の、今回の種類の選定。書き戻すときは field の配列の同じ位置へ置く。
  const selectionsOf = (file: (typeof files)[number]): ArchiveSelection[] => file.data[kind.field] ?? []
  const selected = files.flatMap(file => selectionsOf(file).filter(selection => selection.selected_candidate_id !== null))
  // 全件の宣言・保存先の衝突を検査してから、最初の取得・上書きを始める。
  let groups = planArchives(files.flatMap(selectionsOf), kind)
  for (const file of files) if (`${file.data.jurisdiction}.json` !== file.path.split('/').at(-1)) throw new Error(`Jurisdiction differs from file: ${file.path}`)
  const locations = new Map(files.flatMap(file => selectionsOf(file).map((selection, index) => [selection, { file, index }] as const)))
  let previous: ArchiveSelection | undefined
  if (replacement) {
    previous = selected.find(selection => targetKey(selection.target) === targetKey(replacement.target))
    if (!previous) throw new Error('Replacement target is absent from the current selected registry')
    const location = locations.get(previous)!
    planFiles([replacement], previous, nextPart, kind)
    locations.set(replacement, location)
    groups = [[replacement]]
  }
  let archived = 0
  let uploadedFiles = 0
  let skipped = 0
  if (write) {
    for (const group of groups) {
      if (isArchived(group, previous, nextPart, kind)) { skipped++; continue }
      const touched = new Set(group.map(selection => locations.get(selection)!.file))
      // 書き換えが完了するまで保存記録を無効にする。
      if (!previous) for (const selection of group) {
        const { file, index } = locations.get(selection)!
        selectionsOf(file)[index] = { ...selection, archive: null }
      }
      if (!previous) for (const file of touched) await saveSelections(file.path, file.data)
      const results = await archiveGroup(group, cfTransport, previous, nextPart, kind)
      for (const [offset, selection] of group.entries()) {
        const { file, index } = locations.get(selection)!
        selectionsOf(file)[index] = results[offset]!
      }
      for (const file of touched) {
        jurisdictionSelectionsSchema.parse(file.data)
        await saveSelections(file.path, file.data)
      }
      archived++
      const planned = planFiles(group, previous, nextPart, kind)
      const retained = retainedReceipts(group, previous, kind)
      uploadedFiles += planned.filter(item => !retained.has(item.file.sha256!)).length
      console.error(JSON.stringify({ archived, slot: kind.slot(group[0]!.target), files: planned.length, targets: group.length }))
    }
  }
  console.log(JSON.stringify({ mode: write ? 'write' : 'plan', bucket: ARCHIVE_BUCKET, selected_targets: replacement ? 1 : selected.length, selected_files: groups.reduce((n, group) => n + planFiles(group, previous, nextPart, kind).length, 0), storage_slots: groups.length, uploaded_files: uploadedFiles, skipped_slots: skipped, objects: groups.map(group => ({ targets: group.length, keys: planFiles(group, previous, nextPart, kind).map(item => item.key) })) }, null, 2))
}

if (import.meta.main) main(Bun.argv.slice(2)).catch(error => { console.error(JSON.stringify({ error: String(error) })); process.exitCode = 1 })
