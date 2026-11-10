// 歳出の集約: 1つの資料（自治体・年度・資料区分・補正号）の1つの会計の歳出全体。
// 中に歳出の行（科目＝款・項・目、科目の下の内訳）と印字の位置を持つ。守ること: 末端の科目の和が総額。内訳は科目と足さない。
import { z } from 'zod'
import { FiscalYear, JurisdictionCode, Origin, OriginFormat, Yen } from '../shared/model'

export const DocumentKind = z.enum(['initial', 'settlement']).describe('資料区分。initial は当初予算、settlement は決算')
export const CofogCertainty = z.enum(['assigned', 'tentative'])
export const CofogUnclassified = z.enum(['unclassifiable', 'out-of-scope'])
export const Breakdown = z.enum(['事業', '節', 'その他']).describe('内訳の分け方（風土記の判断）')
export const LocationKind = z.enum(['pdf', 'csv'])

/** 会計。種類は対応表 account_kind_map が正（風土記の判断）で、自治体をまたぐ比較に使う */
export const Account = z.strictObject({
  name: z.string().describe('出典の会計名'),
  kind: z.string().describe('自治体共通の会計の種類（account_kind_map の値）'),
})

export const ExpenditureOrigin = Origin.extend({ format: OriginFormat })

/** 頁の左上を原点にした pt */
export const Box = z.strictObject({ x0: z.number().nullable(), y0: z.number().nullable(), x1: z.number().nullable(), y1: z.number().nullable() })

/** 印字の位置。出典の形式で形が違う */
export const Location = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pdf'),
    origin_id: z.string(),
    page: z.int().min(1).describe('名前が印字された頁（ファイルの中で1から数える）'),
    box: Box,
    amount_page: z.int().min(1).nullable(),
    amount_box: Box.nullable().describe('1つの印字が全額のときだけ'),
  }),
  z.strictObject({
    kind: z.literal('csv'),
    origin_id: z.string(),
    line: z.int().min(1).describe('名前の行（ファイルの中の物理行）'),
    amount_line: z.int().min(1).nullable(),
  }),
])
export type Location = z.infer<typeof Location>

/** 分野。目だけに付く（風土記の判断） */
export const Field = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('classified'), certainty: CofogCertainty, cofog_code: z.string() }),
  z.strictObject({ kind: z.literal('unclassified'), reason: CofogUnclassified }),
])
export type Field = z.infer<typeof Field>

const detailCommon = {
  detail_id: z.string(),
  heading: z.string().describe('段の名前（内訳1・事項・節…。印字の見出し）'),
  name: z.string().describe('資料のまま'),
  setsu_id: z.string().nullable().describe('法定の節（節マスタに当たった行だけ）'),
  interfund_transfer_to: z.string().nullable().describe('他の会計への繰出金のときの受け手の会計の種類'),
  amount_yen: Yen.nullable(),
  location: Location,
}

/** 内訳。分け方で形が違う。内訳の内訳を持つ（深さは資料しだい） */
export type Detail =
  | { kind: 'project'; department: string | null; children: Detail[] } & DetailCommon
  | { kind: 'other'; breakdown: '節' | 'その他'; children: Detail[] } & DetailCommon
type DetailCommon = z.infer<z.ZodObject<typeof detailCommon>>
export const Detail: z.ZodType<Detail> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ ...detailCommon, kind: z.literal('project'), department: z.string().nullable().describe('所管課（名前の末尾の【】）'), children: z.array(Detail) }),
    z.strictObject({ ...detailCommon, kind: z.literal('other'), breakdown: z.enum(['節', 'その他']), children: z.array(Detail) }),
  ])
)

const subjectCommon = {
  subject_id: z.string(),
  code: z.string().nullable().describe('資料に印字された番号。同じ親の中でだけ重ならない'),
  name: z.string(),
  amount_yen: Yen.describe('子の科目の和と合う（資料の印字が合わないところは宣言済みのずれ）'),
  location: Location,
}
export const Moku = z.strictObject({
  ...subjectCommon,
  field: Field,
  interfund_transfer_to: z.string().nullable(),
  details: z.array(Detail).describe('科目と足さない'),
})
export const Kou = z.strictObject({
  ...subjectCommon,
  moku: z.array(Moku).describe('目の無い項は空'),
  details: z.array(Detail).describe('科目と足さない'),
})
export const Kan = z.strictObject({ ...subjectCommon, kou: z.array(Kou) })

/** 歳出の根 */
export const Expenditure = z.strictObject({
  expenditure_id: z.string(),
  jurisdiction_code: JurisdictionCode,
  fiscal_year: FiscalYear,
  document_kind: DocumentKind,
  amendment_number: z.int().nullable().describe('補正予算の号数（未収録）'),
  account: Account,
  origins: z.array(ExpenditureOrigin).min(1).describe('値を取った予算書・決算書。分冊は冊ごと'),
  kan: z.array(Kan),
})
export type Expenditure = z.infer<typeof Expenditure>
