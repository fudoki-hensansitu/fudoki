// 見せる tool（server/views/）が返す部品の data の形。server が返す前と、画面が描く前の両方で確かめる。
// sessionStorage に古い版の data が残っていても、形が違えば描かずに印だけにする（v で版を分ける）
import { z } from 'zod'
import type { LocalFinance } from '../../jurisdiction/types'

const node = z.object({
  id: z.string(),
  label: z.string(),
  yen: z.number(),
  tone: z.enum(['in', 'out', 'rest']),
  base: z.number().optional(),
})
const per = z.object({ label: z.string(), yen: z.number() }).nullable()

const documentKind = z.enum(['initial', 'settlement'])

const moneyFlow = z.object({
  kind: z.literal('money_flow'),
  v: z.literal(1),
  data: z.object({
    name: z.string(),
    year: z.number(),
    document_kind: documentKind,
    flow: z.object({
      words: z.tuple([z.string(), z.string()]),
      revenue: z.number(),
      expenditure: z.number(),
      incoming: z.array(node),
      outgoing: z.array(node),
      perIn: per,
      perOut: per,
    }),
    /** 自治体の頁の予算・決算のタブ */
    path: z.string(),
  }),
})

/** 年度と、円・%・指数の列（null は統計に無い値） */
const isFinanceRow = (v: unknown) =>
  typeof v === 'object' && v !== null && typeof (v as { year?: unknown }).year === 'number' && Object.values(v).every((x) => x === null || typeof x === 'number')

export const FINANCE_SECTIONS = ['debt', 'free', 'indicators'] as const

const localFinance = z.object({
  kind: z.literal('local_finance'),
  v: z.literal(1),
  data: z.object({
    name: z.string(),
    /** 頁の LocalFinance（年度と、円・%・指数の列） */
    finance: z.array(z.custom<LocalFinance>((v) => isFinanceRow(v))).min(1),
    population: z.object({ people: z.number(), asOf: z.string() }).nullable(),
    prefecture: z.boolean(),
    sections: z.array(z.enum(FINANCE_SECTIONS)).min(1),
    path: z.string(),
  }),
})

const tableRow = z.object({
  name: z.string(),
  /** 科目は款・項・目、内訳は空 */
  level: z.string().nullable(),
  /** 科目は経路（款 › 項）、内訳は親の内訳か属する科目の名前 */
  under: z.string().nullable(),
  /** 所管課 */
  department: z.string().nullable(),
  yen: z.number().nullable(),
  /** 出典の頁（PDF は #page=） */
  url: z.string().nullable(),
  /** 自治体・年度が混ざるときだけ（「品川区 R6年度」） */
  where: z.string().nullable(),
})

const expenditureTable = z.object({
  kind: z.literal('expenditure_table'),
  v: z.literal(1),
  data: z.object({
    table: z.enum(['subjects', 'details']),
    title: z.string(),
    /** 金額の段階（決算額・当初予算額） */
    amountLabel: z.string(),
    /** 内訳は分け方（事業・節・その他）ごと。科目は見出しの無い1つ */
    groups: z.array(z.object({ heading: z.string().nullable(), rows: z.array(tableRow) })),
    hasMore: z.boolean(),
    /** 1つの自治体のときだけ */
    path: z.string().nullable(),
  }),
})

export const View = z.discriminatedUnion('kind', [moneyFlow, localFinance, expenditureTable])
export type View = z.infer<typeof View>
export type ViewKind = View['kind']
export type ViewData<K extends ViewKind> = Extract<View, { kind: K }>['data']

/** 見せる tool の結果。成功は view を持ち、失敗は持たない */
export type ViewResult = { content: { type: 'text'; text: string }[]; view: View } | { content: { type: 'text'; text: string }[]; isError: true }

/** tool の結果から描ける view を取り出す。無い・形が違うときは undefined */
export function readView(output: unknown): View | undefined {
  const view = (output as { view?: unknown } | undefined)?.view
  if (view === undefined) return undefined
  const r = View.safeParse(view)
  return r.success ? r.data : undefined
}
