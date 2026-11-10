// 自治体の集約。自治体コード・名前・都道府県を決める。
import { z } from 'zod'
import { JurisdictionCode } from '../shared/model'

export const Jurisdiction = z.strictObject({
  jurisdiction_code: JurisdictionCode,
  name: z.string().describe('自治体の名前（例: 武蔵野市）'),
  prefecture_code: z.string().regex(/^\d{2}$/),
  prefecture_name: z.string(),
  ocd_id: z.string(),
  official_url: z.url().nullable().describe('公式サイト'),
})
export type Jurisdiction = z.infer<typeof Jurisdiction>
