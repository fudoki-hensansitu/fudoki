// 人口の集約。ある基準日の自治体の住民基本台帳人口。出典は総務省の集計（基準日と URL だけを持つ）。
import { z } from 'zod'
import { JurisdictionCode } from '../shared/model'

export const PopulationOrigin = z.strictObject({
  origin_id: z.string(),
  reference_date: z.iso.date().describe('基準日'),
  url: z.url(),
})
export type PopulationOrigin = z.infer<typeof PopulationOrigin>

export const Population = z.strictObject({
  jurisdiction_code: JurisdictionCode,
  reference_date: z.iso.date().describe('基準日'),
  male: z.int().min(0),
  female: z.int().min(0),
  population: z.int().min(0).describe('総数'),
  households: z.int().min(0).describe('世帯数'),
  origin: PopulationOrigin,
})
export type Population = z.infer<typeof Population>
