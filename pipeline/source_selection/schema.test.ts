import { expect, test } from 'bun:test'
import { evaluationSelectionsSchema, jurisdictionSelectionsSchema, sourceCandidateSchema, sourceSelectionsSchema, sourceTargetSchema, type SourceCandidate, type SourceSelection } from './schema'

const target = { jurisdiction: '132047', fiscal_year: 2024, document_kind: 'initial' as const }
const candidate: SourceCandidate = {
  id: 'annual', title: '令和6年度予算', landing_url: 'https://example.com/budget', inspected_at: '2026-10-07T00:00:00Z',
  files: [{ download_url: 'https://example.com/budget.pdf', format: 'pdf', sha256: 'a'.repeat(64), pdf_type: 'text',
    scope: [{ account: '一般会計', direction: 'expenditure', pages: [{ start: 8, end: 20 }] },
      { account: '駐車場事業特別会計', direction: 'revenue', pages: [{ start: 21, end: 23 }] }] }],
}
const selection: SourceSelection = { target, candidates: [candidate], selected_candidate_id: candidate.id, archive: null, reason: '目次と明細を確認。' }

test('selection targets exclude accounts and directions and only supplementary has a positive amendment', () => {
  expect(sourceTargetSchema.safeParse(target).success).toBe(true)
  for (const extra of [{ account: '一般会計' }, { direction: 'revenue' }, { amendment_number: null }]) {
    expect(sourceTargetSchema.safeParse({ ...target, ...extra }).success).toBe(false)
  }
  const supplementary = { ...target, document_kind: 'supplementary' }
  for (const n of [null, 0, -1, 1.5]) expect(sourceTargetSchema.safeParse({ ...supplementary, amendment_number: n }).success).toBe(false)
  expect(sourceTargetSchema.safeParse({ ...supplementary, amendment_number: 2 }).success).toBe(true)
})

test('one physical file can identify multiple accounts and directions including local account names', () => {
  expect(sourceSelectionsSchema.safeParse([selection]).success).toBe(true)
  const file = candidate.files[0]!
  for (const scope of [
    [{ account: '', direction: 'revenue', pages: [{ start: 1, end: 2 }] }],
    [{ account: '一般会計', direction: 'expense', pages: [{ start: 1, end: 2 }] }],
    [{ account: '一般会計', direction: 'revenue', pages: [{ start: 2, end: 1 }] }],
    [{ account: '一般会計', direction: 'revenue', pages: [{ start: 1, end: 3 }, { start: 3, end: 4 }] }],
    [{ account: '一般会計', direction: 'revenue', pages: [{ start: 1, end: 2 }] }, { account: '一般会計', direction: 'revenue', pages: [{ start: 4, end: 5 }] }],
  ]) expect(sourceCandidateSchema.safeParse({ ...candidate, files: [{ ...file, scope }] }).success).toBe(false)
})

test('all selected files need hashes and content scopes; CSV rejects pages and PDF requires text or scan', () => {
  const csv = { download_url: 'https://example.com/budget.csv', sha256: 'b'.repeat(64), format: 'csv' as const, scope: [{ account: '一般会計', direction: 'revenue' as const }] }
  expect(sourceSelectionsSchema.safeParse([{ ...selection, candidates: [{ ...candidate, files: [csv] }] }]).success).toBe(true)
  for (const changed of [{ ...csv, sha256: null }, { ...csv, scope: null }, { ...csv, scope: [{ ...csv.scope[0], pages: [{ start: 1, end: 2 }] }] }]) {
    expect(sourceSelectionsSchema.safeParse([{ ...selection, candidates: [{ ...candidate, files: [changed] }] }]).success).toBe(false)
  }
  for (const pdf_type of ['mixed', null, undefined]) {
    expect(sourceCandidateSchema.safeParse({ ...candidate, files: [{ ...candidate.files[0], pdf_type }] }).success).toBe(false)
  }
  expect(sourceCandidateSchema.safeParse({ ...candidate, files: [candidate.files[0], candidate.files[0]] }).success).toBe(false)
})

test('references, targets, metadata and file receipts are strict and consistent', () => {
  expect(sourceSelectionsSchema.safeParse([selection, selection]).success).toBe(false)
  expect(sourceSelectionsSchema.safeParse([{ ...selection, candidates: [candidate, { ...candidate, id: 'alternative' }] }]).success).toBe(false)
  expect(sourceSelectionsSchema.safeParse([{ ...selection, selected_candidate_id: 'missing' }]).success).toBe(false)
  expect(sourceCandidateSchema.safeParse({ ...candidate, inspected_at: null }).success).toBe(false)
  expect(sourceCandidateSchema.safeParse({ ...candidate, bytes: 10 }).success).toBe(false)
  const archive = { bucket: 'fudoki-inputs', candidate_id: candidate.id, archived_at: '2026-10-07T00:01:00Z', files: [{ key: 'fiscal/source-selection/132047/2024/initial.pdf', sha256: 'a'.repeat(64), final_url: 'https://example.com/budget.pdf' }] }
  expect(sourceSelectionsSchema.safeParse([{ ...selection, archive }]).success).toBe(true)
  expect(sourceSelectionsSchema.safeParse([{ ...selection, archive: { ...archive, files: [{ ...archive.files[0], key: 'fiscal/source-selection/132047/2023/initial.pdf' }] } }]).success).toBe(false)
  const ledger = { jurisdiction: '132047', name: '三鷹市', official_url: 'https://www.city.mitaka.lg.jp/', selections: [selection], unresolved_candidates: [] }
  expect(jurisdictionSelectionsSchema.safeParse(ledger).success).toBe(true)
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, gaps: [] }).success).toBe(false)
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, unresolved_candidates: [{ candidate, missing: ['account'], reason: '旧単位' }] }).success).toBe(false)
})

test('evaluation selections need hashes but no accounts, and do not need a settlement selection of the same year', () => {
  const settlement = { jurisdiction: '132047', fiscal_year: 2024, document_kind: 'settlement' as const }
  const file = { download_url: 'https://example.com/results.pdf', sha256: 'c'.repeat(64), format: 'pdf' as const, pdf_type: 'text' as const, pages: null }
  const explanation = { target: settlement, candidates: [{ ...candidate, id: 'results', files: [file] }], selected_candidate_id: 'results', archive: null, reason: '決算と同じ頁に掲載。' }
  const ledger = { jurisdiction: '132047', name: '三鷹市', official_url: 'https://www.city.mitaka.lg.jp/', selections: [{ ...selection, target: settlement }], unresolved_candidates: [] }
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, evaluation_selections: [explanation] }).success).toBe(true)
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, evaluation_selections: [] }).success).toBe(true)
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, evaluation_selections: [{ ...explanation, target: { ...settlement, fiscal_year: 2023 } }] }).success).toBe(true)
  for (const changed of [
    { ...explanation, target: target },
    { ...explanation, candidates: [{ ...explanation.candidates[0]!, files: [{ ...file, sha256: null }] }] },
    { ...explanation, candidates: [{ ...explanation.candidates[0]!, files: [{ ...file, scope: candidate.files[0]!.scope }] }] },
    { ...explanation, selected_candidate_id: 'missing' },
    { ...explanation, archive: {} },
  ]) expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, evaluation_selections: [changed] }).success).toBe(false)
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, evaluation_selections: [explanation, explanation] }).success).toBe(false)
  const duplicated = { ...explanation.candidates[0]!, files: [file, { ...file, download_url: 'https://example.com/copy.pdf' }] }
  expect(jurisdictionSelectionsSchema.safeParse({ ...ledger, evaluation_selections: [{ ...explanation, candidates: [duplicated] }] }).success).toBe(false)
})

test('an evaluation archive must use evaluation-settlement keys that match the selected files', () => {
  const settlement = { jurisdiction: '132047', fiscal_year: 2024, document_kind: 'settlement' as const }
  const file = { download_url: 'https://example.com/results.pdf', sha256: 'c'.repeat(64), format: 'pdf' as const, pdf_type: 'text' as const, pages: null }
  const base = { target: settlement, candidates: [{ ...candidate, id: 'results', files: [file] }], selected_candidate_id: 'results', reason: '決算と同じ頁に掲載。' }
  const receipt = (key: string, sha256 = file.sha256) => ({ bucket: 'fudoki-inputs' as const, candidate_id: 'results', archived_at: '2026-10-14T00:00:00Z', files: [{ key, sha256, final_url: file.download_url }] })
  const prefix = 'fiscal/source-selection/132047/2024/'
  expect(evaluationSelectionsSchema.safeParse([{ ...base, archive: receipt(`${prefix}evaluation-settlement.pdf`) }]).success).toBe(true)
  expect(evaluationSelectionsSchema.safeParse([{ ...base, archive: receipt(`${prefix}evaluation-settlement-2.pdf`) }]).success).toBe(true)
  for (const archive of [
    receipt(`${prefix}settlement.pdf`),
    receipt(`${prefix}settlement-evaluation.pdf`),
    receipt(`${prefix}evaluation-settlement.csv`),
    receipt('fiscal/source-selection/132047/2023/evaluation-settlement.pdf'),
    receipt(`${prefix}evaluation-settlement.pdf`, 'd'.repeat(64)),
    { ...receipt(`${prefix}evaluation-settlement.pdf`), candidate_id: 'other' },
  ]) expect(evaluationSelectionsSchema.safeParse([{ ...base, archive }]).success).toBe(false)
  expect(evaluationSelectionsSchema.safeParse([{ ...base, selected_candidate_id: null, archive: receipt(`${prefix}evaluation-settlement.pdf`) }]).success).toBe(false)
})

test('an evaluation file is a PDF, or a CSV taken from a Power BI report with its acquisition', () => {
  const settlement = { jurisdiction: '132012', fiscal_year: 2025, document_kind: 'settlement' as const }
  const acquisition = { type: 'powerbi' as const, table: '01 メイン（済）', columns: ['番号', '事務事業名'], order_by: ['番号'] }
  const file = { download_url: 'https://app.powerbi.com/view?r=abc', sha256: 'c'.repeat(64), format: 'csv' as const, acquisition }
  const base = { target: settlement, candidates: [{ ...candidate, id: 'representative', files: [file] }], selected_candidate_id: 'representative', reason: '公開レポートの表。' }
  const receipt = (key: string) => ({ bucket: 'fudoki-inputs' as const, candidate_id: 'representative', archived_at: '2026-10-23T00:00:00Z', files: [{ key, sha256: file.sha256, final_url: file.download_url }] })
  const prefix = 'fiscal/source-selection/132012/2025/'
  expect(evaluationSelectionsSchema.safeParse([{ ...base, archive: null }]).success).toBe(true)
  expect(evaluationSelectionsSchema.safeParse([{ ...base, archive: receipt(`${prefix}evaluation-settlement.csv`) }]).success).toBe(true)
  expect(evaluationSelectionsSchema.safeParse([{ ...base, archive: receipt(`${prefix}evaluation-settlement.pdf`) }]).success).toBe(false)
  for (const broken of [
    { ...file, acquisition: undefined },
    { ...file, acquisition: { ...acquisition, order_by: ['存在しない列'] } },
    { ...file, acquisition: { ...acquisition, columns: ['番号', '番号'] } },
    { ...file, acquisition: { ...acquisition, columns: [] } },
    { ...file, acquisition: { ...acquisition, type: 'tableau' } },
    { ...file, pdf_type: 'text' },
  ]) expect(evaluationSelectionsSchema.safeParse([{ ...base, archive: null, candidates: [{ ...base.candidates[0]!, files: [broken] }] }]).success).toBe(false)
})
