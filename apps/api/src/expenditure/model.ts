// 歳出の集約: 1つの資料（自治体・年度・資料区分・補正号）の1つの会計の歳出全体。
// 中に歳出の行（科目＝款・項・目、科目の下の内訳）と印字の位置を持つ。守ること: 末端の科目の和が総額。内訳は科目と足さない。
import { z } from 'zod'
import { DETAIL_TABLE, SUBJECT_TABLE, described } from '../columns'
import { nextPageToken } from '../shared/paging'
import { searchInputFor } from '../shared/search'
import { DocumentKind, FiscalYear, JurisdictionCode, Origin, OriginFormat, Yen } from '../shared/model'

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

// --- API の応答（docs/prd/aggregate-api/dd.md）。search は表の行のまま平らに返し、列の型と説明は columns.json から作る ---

const amountPhase = z.enum(['executed', 'approved'])
const level = z.enum(['款', '項', '目'])
const docKind = z.enum(['settlement', 'initial'])

/** 科目と内訳に共通の、根で決まる列と科目の経路 */
const lineCommon = {
  expenditure_id: z.string(),
  jurisdiction_code: z.string(),
  fiscal_year: z.int(),
  document_kind: docKind,
  amendment_number: z.int().nullable(),
  amount_phase: amountPhase,
  account_name: z.string(),
  account_kind: z.string(),
  kan_code: z.string(),
  kan_name: z.string(),
  kou_code: z.string().nullable(),
  kou_name: z.string().nullable(),
  moku_code: z.string().nullable(),
  moku_name: z.string().nullable(),
}

// meta の id を付けると、JSON Schema では $defs に一度だけ出て $ref で参照される（tools/list と OpenAPI が小さくなる）。
export const OriginRow = z
  .strictObject(
    described('expenditure_origin', {
      origin_id: z.string(),
      jurisdiction_code: z.string(),
      fiscal_year: z.int(),
      document_kind: z.string(),
      amendment_number: z.int().nullable(),
      title: z.string(),
      url: z.string(),
      format: z.string(),
      sha256: z.string(),
    })
  )
  .meta({ id: 'ExpenditureOriginRow', description: '出典（資料名・URL・SHA-256）。予算書・決算書の1冊。' })

export const LocationRow = z
  .strictObject(
    described('expenditure_location', {
      line_id: z.string(),
      origin_id: z.string(),
      kind: LocationKind,
      source_page: z.int().nullable(),
      source_x0: z.number().nullable(),
      source_y0: z.number().nullable(),
      source_x1: z.number().nullable(),
      source_y1: z.number().nullable(),
      amount_source_page: z.int().nullable(),
      amount_source_x0: z.number().nullable(),
      amount_source_y0: z.number().nullable(),
      amount_source_x1: z.number().nullable(),
      amount_source_y1: z.number().nullable(),
      source_line: z.int().nullable(),
      amount_source_line: z.int().nullable(),
    })
  )
  .meta({ id: 'LocationRow', description: '行が印字された出典の位置。line_id は subject_id か detail_id。kind が pdf なら頁と枠、csv なら行番号。' })

const subjectShape = described('expenditure_subject', {
  subject_id: z.string(),
  node_key: z.string(),
  parent_subject_id: z.string().nullable(),
  ...lineCommon,
  level,
  code: z.string().nullable(),
  name: z.string(),
  amount_yen: z.int().nullable(),
  is_leaf: z.boolean(),
  cofog_status: z.string().nullable(),
  cofog_code: z.string().nullable(),
  is_interfund_transfer: z.boolean(),
  interfund_transfer_to: z.string().nullable(),
  origin_id: z.string(),
})
export const SubjectRow = z.strictObject(subjectShape).meta({ id: 'SubjectRow', description: '歳出の科目（款・項・目）。' })

const detailShape = described('expenditure_detail', {
  detail_id: z.string(),
  node_key: z.string(),
  parent_detail_id: z.string().nullable(),
  subject_id: z.string(),
  ...lineCommon,
  breakdown: Breakdown,
  source_heading: z.string(),
  node_kind: z.string(),
  depth: z.int(),
  code: z.string().nullable(),
  name: z.string(),
  department: z.string().nullable(),
  amount_yen: z.int().nullable(),
  is_leaf: z.boolean(),
  is_subject_remainder: z.boolean(),
  expenditure_setsu_id: z.string().nullable(),
  is_interfund_transfer: z.boolean(),
  interfund_transfer_to: z.string().nullable(),
  origin_id: z.string(),
})
export const DetailRow = z.strictObject(detailShape).meta({ id: 'DetailRow', description: '歳出の内訳（科目の下の事業・節など）。' })

const ORIGINS_HELP = '結果の行が指す出典。行の origin_id から引く。'
const LOCATIONS_HELP = '結果の行が印字された位置。行の subject_id・detail_id を line_id で引く。'

export const SubjectSearchInput = searchInputFor(SUBJECT_TABLE)
export const DetailSearchInput = searchInputFor(DETAIL_TABLE)

export const SubjectSearchOutput = z.strictObject({
  subjects: z.array(SubjectRow),
  next_page_token: nextPageToken,
  origins: z.array(OriginRow).describe(ORIGINS_HELP),
})
export const DetailSearchOutput = z.strictObject({
  details: z.array(DetailRow),
  next_page_token: nextPageToken,
  origins: z.array(OriginRow).describe(ORIGINS_HELP),
})

export const LineId = z.string().regex(/^[0-9a-f]{64}$/).describe('subject_id or detail_id from a search response (64 lowercase hexadecimal characters).')

/** 歳出の行（科目か内訳）と、その直下。科目なら子の科目と直下（depth = 1）の内訳、内訳なら子の内訳 */
export const Line = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('subject'), ...subjectShape }),
  z.strictObject({ kind: z.literal('detail'), ...detailShape }),
])
export const LineOutput = z.strictObject({
  line: Line.describe('kind が subject なら科目、detail なら内訳。'),
  child_subjects: z.array(SubjectRow).describe('子の科目（款なら項、項なら目）。内訳なら空。ページを切らずに返す。'),
  details: z
    .record(z.string(), z.array(DetailRow))
    .describe('科目なら直下の内訳（depth = 1）、内訳なら子の内訳を breakdown ごとに。breakdown の違う内訳を同じ金額に混ぜて足さない。'),
  next_page_token: nextPageToken.describe('details の次のページの token。無ければ null。'),
  locations: z.array(LocationRow).describe(LOCATIONS_HELP),
  origins: z.array(OriginRow).describe(ORIGINS_HELP),
})
export type LineOutput = z.infer<typeof LineOutput>
export type SubjectSearchOutput = z.infer<typeof SubjectSearchOutput>
export type DetailSearchOutput = z.infer<typeof DetailSearchOutput>
export type SubjectRow = z.infer<typeof SubjectRow>
export type DetailRow = z.infer<typeof DetailRow>
export type LocationRow = z.infer<typeof LocationRow>
export type OriginRow = z.infer<typeof OriginRow>

// --- 歳出の根の額（web のまち比べだけが内部の RPC で使う） ---

/** 総額（款の和）・COFOG の大分類ごとの額（末端の科目の和）・分類の無い額（総額との差）の列 */
export const COFOG_DIVISIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const
export const AMOUNT_COLUMNS = ['total_yen', ...COFOG_DIVISIONS.map((d) => `cofog_${d}_yen` as const), 'cofog_unclassified_yen'] as const

/** 歳出の根の1行（資料×会計）と、その額 */
export const ExpenditureTotals = z.strictObject(
  described('expenditure', {
    jurisdiction_code: z.string(),
    fiscal_year: z.int(),
    document_kind: DocumentKind,
    account_name: z.string(),
    account_kind: z.string(),
    ...(Object.fromEntries(AMOUNT_COLUMNS.map((c) => [c, Yen.nullable()])) as Record<(typeof AMOUNT_COLUMNS)[number], z.ZodNullable<typeof Yen>>),
  })
)
export type ExpenditureTotals = z.infer<typeof ExpenditureTotals>

const Version = z.strictObject({ jurisdiction_code: JurisdictionCode, fiscal_year: FiscalYear, document_kind: DocumentKind })
export const ExpenditureListInput = z.strictObject({ versions: z.array(Version).min(1).max(10).describe('引く資料（自治体・年度・資料区分）') })
export type ExpenditureListInput = z.output<typeof ExpenditureListInput>
export const ExpenditureList = z.strictObject({ expenditures: z.array(ExpenditureTotals).describe('指定した資料の会計すべて。一般会計が先') })
export type ExpenditureList = z.infer<typeof ExpenditureList>

export const SimilarInput = Version.extend({
  among: z.array(JurisdictionCode).min(1).max(100).optional().describe('この自治体の中から探す'),
  limit: z.int().min(1).max(100).default(5),
})
export type SimilarInput = z.output<typeof SimilarInput>
export const SimilarList = z.strictObject({
  expenditures: z
    .array(z.strictObject({ jurisdiction_code: z.string(), name: z.string(), total_yen: z.number() }))
    .describe('同じ年度・資料区分の一般会計で、COFOG の大分類ごとの割合の差（の絶対値）の和が小さい順。都道府県は都道府県どうし、市区町村は市区町村どうし'),
})
export type SimilarList = z.infer<typeof SimilarList>
