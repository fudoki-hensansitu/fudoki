import type { SourceTarget } from './schema'

export const ARCHIVE_BUCKET = 'fudoki-inputs' as const

/** 同じ自治体・年度・資料区分は、会計・歳入／歳出をまたいで選定ファイルを共有する。 */
export function originObjectSlot(target: SourceTarget): string {
  const kind = target.document_kind === 'supplementary' ? `supplementary-${target.amendment_number}` : target.document_kind
  return `fiscal/source-selection/${target.jurisdiction}/${target.fiscal_year}/${kind}`
}

export function originObjectKey(target: SourceTarget, format: 'csv' | 'pdf', index?: number): string {
  return index === undefined ? `${originObjectSlot(target)}.${format}` : `${originObjectSlot(target)}-${index}.${format}`
}

/**
 * 評価資料の保存先。`settlement-` で始めない: 決算書の保存は `<slot>/settlement-` を一覧して、残さない key を消す。
 * 決算書の slot（`.../settlement`）の接頭辞にも、評価資料の slot の接頭辞にも、互いの key は入らない。
 */
export function evaluationObjectSlot(target: Extract<SourceTarget, { document_kind: 'settlement' }>): string {
  return `fiscal/source-selection/${target.jurisdiction}/${target.fiscal_year}/evaluation-${target.document_kind}`
}

export function evaluationObjectKey(target: Extract<SourceTarget, { document_kind: 'settlement' }>, format: 'csv' | 'pdf', index?: number): string {
  return index === undefined ? `${evaluationObjectSlot(target)}.${format}` : `${evaluationObjectSlot(target)}-${index}.${format}`
}
