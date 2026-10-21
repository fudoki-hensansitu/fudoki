import { createHash } from 'node:crypto'
import { expect, test } from 'bun:test'
import { archiveGroup, archiveSelected, evaluationKind, isMissingR2ObjectError, planArchives, planFiles, isArchived, type ArchiveTransport } from './archive'
import { evaluationSelectionsSchema, sourceSelectionsSchema, type EvaluationSelection, type SourceFile, type SourceSelection } from './schema'
import { evaluationObjectKey, originObjectKey } from './storage'

const pdfBody = (text: string) => new TextEncoder().encode(`%PDF-1.7\n${text}\n`)
const body = pdfBody('first original')
const csvBody = new TextEncoder().encode('名称,金額\n事業,100\n')
const secondBody = pdfBody('second part')
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const csv: SourceFile = { scope: [{ account: '一般会計', direction: 'expenditure' }], download_url: 'https://example.com/budget.csv', format: 'csv', sha256: hash(csvBody) }
const pdf: SourceFile = { download_url: 'https://example.com/first.pdf', format: 'pdf', pdf_type: 'text', sha256: hash(body), scope: [{ account: '一般会計', direction: 'expenditure', pages: [{ start: 1, end: 3 }] }] }
const second: SourceFile = { ...pdf, download_url: 'https://example.com/second.pdf', sha256: hash(secondBody) }
const selection: SourceSelection = { target: { jurisdiction: '132047', fiscal_year: 2024, document_kind: 'initial' }, candidates: [{ id: 'one', title: '令和6年度予算', landing_url: 'https://example.com/budget', inspected_at: '2026-10-07T00:00:00Z', files: [csv] }], selected_candidate_id: 'one', archive: null, reason: '必要な名称・金額を持つ資料' }
const withFiles = (files: SourceFile[]): SourceSelection => ({ ...selection, candidates: [{ ...selection.candidates[0]!, files }] })
function transport(previous: string[] = []) {
  const uploads: { key: string; body: Uint8Array; contentType: string }[] = []
  const removed: string[] = []
  const downloads: string[] = []
  const api: ArchiveTransport = {
    async download(url) { downloads.push(url); return { body: url.endsWith('.csv') ? csvBody : url.includes('second') ? secondBody : body, final_url: url } },
    async put(key, body, contentType) { uploads.push({ key, body, contentType }) },
    async list() { return previous },
    async remove(key) { removed.push(key) },
  }
  return { api, uploads, removed, downloads }
}

test('a downloaded notice page that is not the declared format stops before any upload', async () => {
  const notice = new TextEncoder().encode('<!DOCTYPE html><html lang="ja"><body>指定されたページは見つかりませんでした</body></html>')
  const fake = transport()
  await expect(archiveSelected(withFiles([{ ...pdf, sha256: hash(notice) }]),
    { ...fake.api, async download(url) { return { body: notice, final_url: url } } })).rejects.toThrow('is not a PDF')
  expect(fake.uploads).toHaveLength(0)
})

test('a PDF whose header follows leading bytes is still accepted', async () => {
  const prefixed = new TextEncoder().encode('JUNK\n%PDF-1.7\nbody')
  const fake = store([], { 'https://example.com/prefixed.pdf': prefixed })
  const result = await archiveSelected(withFiles([{ ...pdf, download_url: 'https://example.com/prefixed.pdf', sha256: hash(prefixed) }]), fake.api)
  expect(result.archive!.files.map(item => item.key)).toEqual(['fiscal/source-selection/132047/2024/initial.pdf'])
})

test('a declared CSV whose body is an error response is not saved', async () => {
  for (const body of ['{"error":"not found"}', '[{"error":"not found"}]', '<?xml version="1.0"?><error/>']) {
    const fake = store([], { [csv.download_url]: new TextEncoder().encode(body) })
    await expect(archiveSelected(withFiles([{ ...csv, sha256: hash(new TextEncoder().encode(body)) }]), fake.api)).rejects.toThrow('is not a CSV')
    expect(fake.keys.size).toBe(0)
  }
})

test('missing-object cleanup ignores only genuine key-not-found errors', () => {
  for (const error of ['[10007] The specified key does not exist.', 'HTTP status 404', 'NoSuchKey']) expect(isMissingR2ObjectError(error)).toBe(true)
  for (const error of ['HTTP 403', '[10007] Permission denied.', '[10000] The specified key does not exist.', 'Network timeout']) expect(isMissingR2ObjectError(error)).toBe(false)
})

test('unselected targets cause no transfer and uploaded receipts are trusted without readback', async () => {
  const fake = transport()
  const pending = { ...selection, selected_candidate_id: null, archive: null }
  expect(await archiveSelected(pending, fake.api)).toEqual(pending)
  expect(fake.downloads).toHaveLength(0)
  const result = await archiveSelected(selection, fake.api)
  expect(result.archive!.files).toEqual([{ key: 'fiscal/source-selection/132047/2024/initial.csv', sha256: csv.sha256!, final_url: csv.download_url }])
  expect(result.candidates[0]!.inspected_at).toBe(selection.candidates[0]!.inspected_at)
  expect(fake.removed).toEqual(['fiscal/source-selection/132047/2024/initial.pdf'])
  expect(await archiveSelected(result, fake.api)).toEqual(result)
  expect(fake.downloads).toHaveLength(1)
  expect(fake.uploads).toHaveLength(1)
  expect(sourceSelectionsSchema.safeParse([result]).success).toBe(true)
})

test('a split document shares one file across its content sections and uploads each physical file once', async () => {
  const fake = transport(['fiscal/source-selection/132047/2024/initial-1.pdf', 'fiscal/source-selection/132047/2024/initial-2.pdf'])
  const shared: SourceFile = { ...second, format: 'pdf', pdf_type: 'scan',
    scope: [{ account: '一般会計', direction: 'expenditure', pages: [{ start: 1, end: 3 }] },
      { account: '駐車場事業特別会計', direction: 'revenue', pages: [{ start: 8, end: 12 }] }] }
  const result = await archiveSelected(withFiles([pdf, shared]), fake.api)
  expect(fake.uploads).toHaveLength(2)
  expect(fake.downloads).toHaveLength(2)
  expect(new Set(fake.uploads.map(item => item.key))).toEqual(new Set(['fiscal/source-selection/132047/2024/initial-1.pdf', 'fiscal/source-selection/132047/2024/initial-2.pdf']))
  expect(result.candidates[0]!.files[1]!.scope).toEqual(shared.scope)
  expect(sourceSelectionsSchema.safeParse([result]).success).toBe(true)
})

test('all parts are checked before the first upload and a failed part cannot produce receipts', async () => {
  const fake = transport()
  await expect(archiveGroup([withFiles([pdf, { ...second, sha256: 'a'.repeat(64) }])], fake.api)).rejects.toThrow('Original changed')
  expect(fake.uploads).toHaveLength(0)
  const fail = transport()
  let puts = 0
  const input = withFiles([pdf, second])
  const before = structuredClone(input)
  await expect(archiveGroup([input], { ...fail.api, async put() { if (++puts === 2) throw new Error('upload failed') } })).rejects.toThrow('upload failed')
  expect(fail.removed).toHaveLength(0)
  expect(input).toEqual(before)
})

test('a smaller selection overwrites the current file and removes obsolete flat parts', async () => {
  const stale = ['fiscal/source-selection/132047/2024/initial-1.pdf', 'fiscal/source-selection/132047/2024/initial-2.pdf']
  const fake = transport(stale)
  await archiveSelected(selection, fake.api)
  expect(fake.uploads[0]!.key).toBe('fiscal/source-selection/132047/2024/initial.csv')
  expect(fake.removed).toEqual([...stale, 'fiscal/source-selection/132047/2024/initial.pdf'])
  expect(originObjectKey({ ...selection.target, document_kind: 'supplementary', amendment_number: 1 }, 'pdf', 2)).toBe('fiscal/source-selection/132047/2024/supplementary-1-2.pdf')
})

test('conflicting identities and metadata outside the slot stop before any transfer', async () => {
  const fake = transport()
  const conflicting = { ...withFiles([{ ...csv, sha256: 'a'.repeat(64) }]), target: { ...selection.target } }
  await expect(archiveGroup([selection, conflicting], fake.api)).rejects.toThrow()
  expect(fake.downloads).toHaveLength(0)
  const wrong = transport(['another/initial-1.pdf'])
  await expect(archiveSelected(selection, wrong.api)).rejects.toThrow('escaped')
  expect(wrong.uploads).toHaveLength(0)
  expect(wrong.removed).toHaveLength(0)
})

function additiveReplacement() {
  const thirdBody = pdfBody('third retained part')
  const newBody = pdfBody('new text PDF')
  const third: SourceFile = { ...pdf, download_url: 'https://example.com/third.pdf', sha256: hash(thirdBody) }
  const added: SourceFile = { ...pdf, download_url: 'https://example.com/new.pdf', sha256: hash(newBody) }
  const original = withFiles([pdf, second, third])
  const previous: SourceSelection = { ...original, selected_candidate_id: 'one', archive: { bucket: 'fudoki-inputs', candidate_id: 'one',
    archived_at: '2026-10-07T00:00:00Z', files: [pdf, second, third].map((file, index) => ({
      key: originObjectKey(original.target, 'pdf', index + 1), sha256: file.sha256!, final_url: file.download_url })) } }
  const replacement = withFiles([pdf, second, third, added])
  return { previous, replacement, newBody, added }
}

test('additive replacement retains three exact keys and bytes and puts only the fourth original', async () => {
  const { previous, replacement, newBody, added } = additiveReplacement()
  const oldObjects = new Map<string, Uint8Array>(previous.archive!.files.map((item, i) => [item.key, [body, secondBody, pdfBody('third retained part')][i]!]))
  const oldBytes = structuredClone(oldObjects)
  const fake = transport([...oldObjects.keys()])
  const result = (await archiveGroup([replacement], { ...fake.api,
    async download(url) { fake.downloads.push(url); return { body: newBody, final_url: url } },
    async put(key, bytes, contentType) { fake.uploads.push({ key, body: bytes, contentType }); oldObjects.set(key, bytes) },
  }, previous))[0]!
  expect(fake.downloads).toEqual([added.download_url])
  expect(fake.uploads.map(item => item.key)).toEqual(['fiscal/source-selection/132047/2024/initial-4.pdf'])
  expect(fake.removed).toHaveLength(0)
  for (const [key, bytes] of oldBytes) expect(oldObjects.get(key)).toEqual(bytes)
  expect(result.archive!.files.slice(0, 3)).toEqual(previous.archive!.files)
  expect(planFiles([result]).map(item => item.key)).toEqual(planFiles([replacement], previous).map(item => item.key))
  expect(isArchived([result])).toBe(true)
  expect(sourceSelectionsSchema.safeParse([result]).success).toBe(true)
})

test('replacement collision, changed original, invalid target and retained format stop without altering either selection', async () => {
  for (const reason of ['collision', 'changed', 'target', 'format', 'upload']) {
    const { previous, replacement, newBody } = additiveReplacement()
    const other = structuredClone(selection)
    const before = structuredClone({ previous, replacement, other })
    const fake = transport(reason === 'collision' ? ['fiscal/source-selection/132047/2024/initial-4.pdf'] : [])
    const candidate = structuredClone(replacement)
    if (reason === 'target') candidate.target.fiscal_year++
    if (reason === 'format') candidate.candidates[0]!.files[0] = csv
    await expect(archiveGroup([candidate], { ...fake.api,
      async download(url) { fake.downloads.push(url); return { body: reason === 'changed' ? body : newBody, final_url: url } },
      async put() { throw new Error('upload failed') },
    }, previous)).rejects.toThrow()
    expect({ previous, replacement, other }).toEqual(before)
    expect(fake.uploads).toHaveLength(0)
    expect(fake.removed).toHaveLength(0)
    if (reason !== 'changed' && reason !== 'upload') expect(fake.downloads).toHaveLength(0)
  }
})

test('replacement next-part skips an unregistered fourth object and still refuses collisions and invalid numbers', async () => {
  const { previous, replacement, newBody, added } = additiveReplacement()
  const fourth = 'fiscal/source-selection/132047/2024/initial-4.pdf'
  const fifth = 'fiscal/source-selection/132047/2024/initial-5.pdf'
  const fake = transport([fourth])
  const api = { ...fake.api, async download(url: string) { fake.downloads.push(url); return { body: newBody, final_url: url } } }
  expect(planFiles([replacement], previous, 5).find(item => item.file.sha256 === added.sha256)!.key).toBe(fifth)
  const result = (await archiveGroup([replacement], api, previous, 5))[0]!
  expect(fake.uploads.map(item => item.key)).toEqual([fifth])
  expect(fake.removed).toHaveLength(0)
  expect(result.archive!.files.slice(0, 3)).toEqual(previous.archive!.files)
  expect(isArchived([result])).toBe(true)
  await expect(archiveGroup([replacement], { ...api, async list() { return [fourth, fifth] } }, previous, 5)).rejects.toThrow('refusing overwrite')
  expect(fake.downloads).toHaveLength(1)
  for (const value of [0, 3, 4.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => planFiles([replacement], previous, value)).toThrow('next-part')
  expect(() => planFiles([replacement], undefined, 5)).toThrow('next-part')
})

// 評価資料: 決算書と同じ自治体・年度で、別の slot（evaluation-settlement）に保存する。
const settlementTarget = { jurisdiction: '132047', fiscal_year: 2024, document_kind: 'settlement' as const }
const evaluationFile = (data: Uint8Array, name: string) => ({ download_url: `https://example.com/${name}.pdf`, sha256: hash(data), format: 'pdf' as const, pdf_type: 'text' as const, pages: null })
const evaluation = (files: ReturnType<typeof evaluationFile>[]): EvaluationSelection => ({ target: settlementTarget,
  candidates: [{ id: 'results', title: '主要施策の成果', landing_url: 'https://example.com/results', inspected_at: '2026-10-13T00:00:00Z', files }],
  selected_candidate_id: 'results', archive: null, reason: '決算と同じ頁に掲載。' })
const settlementSelection: SourceSelection = { ...selection, target: settlementTarget, candidates: [{ ...selection.candidates[0]!, files: [{ ...pdf, sha256: hash(body) }] }] }

/** prefix を実際に絞って返す、key の集合を持つ偽物。 */
function store(initial: string[], bodies: Record<string, Uint8Array> = {}) {
  const keys = new Set(initial)
  const listed: string[] = []
  const api: ArchiveTransport = {
    async download(url) { return { body: bodies[url] ?? body, final_url: url } },
    async put(key) { keys.add(key) },
    async list(prefix) { listed.push(prefix); return [...keys].filter(key => key.startsWith(prefix)).sort() },
    async remove(key) { keys.delete(key) },
  }
  return { api, keys, listed }
}

test('evaluation originals are saved under evaluation-settlement keys, numbered only when there are several', async () => {
  const single = store([])
  const one = await archiveSelected(evaluation([evaluationFile(body, 'results')]), single.api, evaluationKind)
  expect(one.archive!.files.map(item => item.key)).toEqual(['fiscal/source-selection/132047/2024/evaluation-settlement.pdf'])
  expect(evaluationObjectKey(settlementTarget, 'pdf')).toBe('fiscal/source-selection/132047/2024/evaluation-settlement.pdf')
  expect(single.listed).toEqual(['fiscal/source-selection/132047/2024/evaluation-settlement-'])
  expect(evaluationSelectionsSchema.safeParse([one]).success).toBe(true)
  expect(isArchived([one], undefined, undefined, evaluationKind)).toBe(true)
  const several = store([], { 'https://example.com/second.pdf': secondBody })
  const two = await archiveSelected(evaluation([evaluationFile(body, 'results'), evaluationFile(secondBody, 'second')]), several.api, evaluationKind)
  expect(new Set(two.archive!.files.map(item => item.key))).toEqual(new Set(['fiscal/source-selection/132047/2024/evaluation-settlement-1.pdf', 'fiscal/source-selection/132047/2024/evaluation-settlement-2.pdf']))
  expect(evaluationSelectionsSchema.safeParse([two]).success).toBe(true)
})

test('an evaluation original whose bytes differ from the selection stops before any upload', async () => {
  const fake = store([])
  await expect(archiveSelected(evaluation([{ ...evaluationFile(body, 'results'), sha256: 'a'.repeat(64) }]), fake.api, evaluationKind)).rejects.toThrow('Original changed')
  expect(fake.keys.size).toBe(0)
})

test('archiving a settlement document does not list or delete evaluation-settlement keys', async () => {
  const evaluationKeys = ['fiscal/source-selection/132047/2024/evaluation-settlement.pdf', 'fiscal/source-selection/132047/2024/evaluation-settlement-1.pdf']
  const fake = store([...evaluationKeys, 'fiscal/source-selection/132047/2024/settlement-1.pdf', 'fiscal/source-selection/132047/2024/settlement-2.pdf'])
  const result = await archiveSelected(settlementSelection, fake.api)
  expect(fake.listed).toEqual(['fiscal/source-selection/132047/2024/settlement-'])
  expect(result.archive!.files.map(item => item.key)).toEqual(['fiscal/source-selection/132047/2024/settlement.pdf'])
  for (const key of evaluationKeys) expect(fake.keys.has(key)).toBe(true)
  expect([...fake.keys].filter(key => !evaluationKeys.includes(key)).sort()).toEqual(['fiscal/source-selection/132047/2024/settlement.pdf'])
})

test('archiving evaluation originals does not list or delete settlement keys', async () => {
  const settlementKeys = ['fiscal/source-selection/132047/2024/settlement.pdf', 'fiscal/source-selection/132047/2024/settlement-1.pdf', 'fiscal/source-selection/132047/2024/settlement-2.pdf']
  const fake = store([...settlementKeys, 'fiscal/source-selection/132047/2024/evaluation-settlement-3.pdf'])
  const result = await archiveSelected(evaluation([evaluationFile(body, 'results')]), fake.api, evaluationKind)
  expect(fake.listed).toEqual(['fiscal/source-selection/132047/2024/evaluation-settlement-'])
  expect(result.archive!.files.map(item => item.key)).toEqual(['fiscal/source-selection/132047/2024/evaluation-settlement.pdf'])
  for (const key of settlementKeys) expect(fake.keys.has(key)).toBe(true)
  expect(fake.keys.has('fiscal/source-selection/132047/2024/evaluation-settlement-3.pdf')).toBe(false)
})

test('evaluation replacement keeps the saved keys and puts only the new original at the next part number', async () => {
  const added = pdfBody('added evaluation')
  const prefix = 'fiscal/source-selection/132047/2024/evaluation-settlement'
  const saved = [evaluationFile(body, 'results'), evaluationFile(secondBody, 'second')]
  const previous = { ...evaluation(saved), archive: { bucket: 'fudoki-inputs' as const, candidate_id: 'results', archived_at: '2026-10-14T00:00:00Z',
    files: saved.map((file, index) => ({ key: `${prefix}-${index + 1}.pdf`, sha256: file.sha256, final_url: file.download_url })) } }
  const replacement = evaluation([...saved, evaluationFile(added, 'added')])
  const fake = store(previous.archive.files.map(item => item.key), { 'https://example.com/added.pdf': added })
  const result = (await archiveGroup([replacement], fake.api, previous, undefined, evaluationKind))[0]!
  expect(result.archive!.files.map(item => item.key)).toEqual([1, 2, 3].map(n => `${prefix}-${n}.pdf`))
  expect(evaluationSelectionsSchema.safeParse([result]).success).toBe(true)
  expect(fake.keys.size).toBe(3)
})
