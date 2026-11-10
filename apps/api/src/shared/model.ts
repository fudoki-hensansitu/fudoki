// 集約をまたいで使う値の型（docs/prd/aggregate-api/dd.md）。zod と型だけを置き、I/O を持たない（web も import する）。
import { z } from 'zod'

export const Yen = z.int().describe('円（整数）')
export const FiscalYear = z.int().min(1900).max(2200).describe('会計年度（西暦。R7年度 = 2025）')
export const JurisdictionCode = z.string().regex(/^\d{6}$/).describe('全国地方公共団体コード（6桁）')
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)

export const OriginFormat = z.enum(['pdf', 'csv'])

/** 出典。値を取った資料そのもの（公式サイトの URL と、風土記が保存したファイルの指紋） */
export const Origin = z.strictObject({
  origin_id: z.string(),
  title: z.string().describe('資料名'),
  url: z.url().describe('公式サイトの公開 URL（ファイルそのもの）'),
  sha256: Sha256.nullable().describe('風土記が保存したファイルの SHA-256'),
})
export type Origin = z.infer<typeof Origin>

/** 頁つきの出典（評価シート・施策のように、1件が資料の1頁から決まるもの） */
export const PagedOrigin = Origin.extend({ page: z.int().min(1).describe('ファイルの中で1から数えた頁') })
export type PagedOrigin = z.infer<typeof PagedOrigin>
