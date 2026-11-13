// 自治体の頁（アプリ型）のデータ。server/app-data.ts が API から組んだ1年度の分を、画面の見え方に組み直す。
// 事業は頁ごとに API から読む（1頁目はサーバーが lists に入れて渡す）。施策・評価シートは年度の分を全部持ち、事業とは歳出の内訳の ID で照らす
import { DOMAIN_FRAMES, OTHER_FRAME, type DomainFrame } from '../domains'
import { listKey, type ListPage, type ListQuery, type ProjRow, type ProjectFull } from './api'

export type { ProjRow as Proj } from './api'
export type Measure = { id: string; fy: number; title: string; new: boolean; yen: number | null; desc: string[]; /** 紐付けた当初予算書の内訳 */ detail: string | null; field: string; url: string; /** 出典の origin_id。アシスタントが read_source_page で頁を読むのに使う */ origin: string; page: number }
export type DirectionCode = 'new' | 'expand' | 'keep' | 'statutory' | 'as_planned' | 'improve' | 'resize' | 'reduce' | 'merge' | 'complete' | 'end' | 'consider_end'
export type Sheet = { id: string; fy: number; name: string; grade: 'A' | 'B' | 'C' | 'D' | null; dir: string | null; dc: DirectionCode | null; /** 方向性の区分の言い方（API の outlook.label） */ dl: string | null; div: string | null; acct: string; b: number | null; s: number | null; /** 紐付けた決算書の内訳 */ detail: string | null; field: string; url: string; /** 出典の origin_id。アシスタントが read_source_page で頁を読むのに使う */ origin: string; page: number }
/** 款・項・目（年度の kind の資料）。上から下へ見ていく予算のタブに使う */
export type Kan = { name: string; yen: number; kou: { name: string; yen: number; moku: { id: string; name: string; yen: number; field: string; /** COFOG のコード。分野の頁の内訳（中分類）に使う */ cofog: string | null }[] }[] }
export type YearData = {
  /** 決算のある年度は決算（settlement）、決算より後の年度は当初予算（initial） */
  kind: 'initial' | 'settlement'
  kan: Kan[]
  total: number
  fields: Record<string, number>
  /** 分野ごとの末端の科目（目と、目の無い項）の ID。分野で事業を絞るのに使う */
  fieldSubjects: Record<string, string[]>
  /** 項の行が無い目（款の木に入らない）。分野の合計には入るので、分野の内訳はこれも足す */
  looseMoku: Kan['kou'][number]['moku']
  origin: string | null
  originTitle: string | null
}
/** 会計ごとの総額（款の和）。一般会計が先頭 */
export type AccountTotal = { name: string; yen: number; amountMissing?: true }
/** 1年度の頁のデータ。years は開いた年度の款項目、施策・評価シート・事業の1頁目はその年度の分。
 * 前の年度の科目と、新しく始める・やめた事業の一覧の1頁目は、事業のタブの頁だけが持つ */
export type Snapshot = {
  code: string
  name: string
  pop: number
  year: number
  /** 頁で選べる年度ごとの資料の種類（年度の切り替えに使う） */
  kinds: Record<string, YearData['kind']>
  years: Record<string, YearData>
  /** 前の年度。分野ごとの科目はやめた事業を分野で絞るのに使い、事業のタブの頁だけが持つ */
  prev?: { year: number; kind: YearData['kind']; fieldSubjects?: YearData['fieldSubjects'] }
  /** 一般会計のほかにも会計を収録した年度の、会計ごとの総額 */
  accounts?: AccountTotal[]
  measures: Measure[]
  sheets: Sheet[]
  /** 評価のある最新の年度の評価シート（ホームのまちの札だけが読む） */
  evaluated?: { fy: number; sheets: Sheet[] }
  /** 事業の収録がある自治体か。無ければ目を事業の代わりに並べる */
  hasProjects: boolean
  /** 事業の一覧の1頁目（listKey ごと） */
  lists: Record<string, ListPage>
}

export type Field = DomainFrame & { yen: number }

/** 分野は金額の多い順。その他は常に最後 */
const byYenOtherLast = (a: Field, b: Field) => Number(a.id === 'other') - Number(b.id === 'other') || b.yen - a.yen

/** 一覧の条件（年度・資料は頁の年度のもの） */
export function listQuery(d: Pick<Snapshot, 'code' | 'year' | 'years' | 'prev'>, filter: ListQuery['filter'], opt: { subjects?: string[]; q?: string } = {}): ListQuery {
  const kind = d.years[String(d.year)]?.kind ?? 'settlement'
  const prevKind = d.prev?.kind
  return { code: d.code, year: d.year, kind, filter, ...(filter === 'ended' && prevKind ? { prevKind } : {}), ...opt }
}

export type YearView = ReturnType<typeof yearView>

export function yearView(d: Snapshot) {
  const year = d.year
  const ys = String(year)
  const hasPrev = !!d.prev
  const y = d.years[ys]!
  const fields: Field[] = [...DOMAIN_FRAMES, OTHER_FRAME].map((f) => ({ ...f, yen: y.fields[f.id] ?? 0 })).filter((f) => f.yen > 0).sort(byYenOtherLast)
  const fieldBySubject = new Map([d.prev?.fieldSubjects ?? {}, y.fieldSubjects].flatMap((x) => Object.entries(x).flatMap(([f, ids]) => ids.map((id) => [id, f] as const))))
  const page = (filter: ListQuery['filter']) => d.lists[listKey(listQuery(d, filter))]
  // 事業の収録の無い自治体は、目を事業の代わりにする（中の事業・所管課は持たない）
  const mokuRows: ProjRow[] = y.kan
    .flatMap((k) => k.kou.flatMap((o) => o.moku.map((m) => ({ id: `moku:${m.id}`, fy: year, name: m.name, dept: null, path: [k.name, o.name, m.name], subject: m.id, yen: m.yen, started: null, ended: null, details: [] }))))
    .sort((a, b) => b.yen - a.yen)
  const top = d.hasProjects ? (page('all')?.rows ?? []) : mokuRows.slice(0, 10)
  const measures = d.measures
  // NEW はその年度に始めた事業（予算書に新しく出てきた事業）だけ。施策の新規はこの印に使わない
  const isNew = (p: Pick<ProjRow, 'started'>) => p.started === year
  // やめた事業は前の年度で終えた事業（DB の事業の終えた年度）だけ
  const isEnded = (p: Pick<ProjRow, 'ended'>) => p.ended === year - 1
  const fresh = measures.filter((m) => m.new).sort((a, b) => (b.yen ?? 0) - (a.yen ?? 0))
  // 評価シートは評価した事業を行った年度の頁に出す（R6 の事業の評価は R6 の頁）。まだ評価の無い年度は出さない
  const sheets = d.sheets
  return {
    year,
    total: y.total,
    /** 人口の無い自治体は null */
    perHead: d.pop ? y.total / d.pop : null,
    origin: y.origin,
    originTitle: y.originTitle,
    fields,
    /** 事業の分野。科目の分からない事業はその他 */
    fieldOf: (p: Pick<ProjRow, 'subject'>) => (p.subject ? fieldBySubject.get(p.subject) : undefined) ?? OTHER_FRAME.id,
    /** 分野の末端の科目。やめた事業は前の年度の資料で探すので、前の年度の科目 */
    subjectsOf: (field: string, filter?: ListQuery['filter']) => (filter === 'ended' ? d.prev : y)?.fieldSubjects?.[field] ?? [],
    query: (filter: ListQuery['filter'], opt?: { subjects?: string[]; q?: string }) => listQuery(d, filter, opt),
    page,
    hasProjects: d.hasProjects,
    /** お金のかかる事業（1頁目） */
    top,
    mokuRows,
    /** 予算書に無い施策（予算書の事業に紐付けられなかった発表）。事業の収録が無い自治体は、新しく始める事業を施策だけで出す */
    freshUnlinked: d.hasProjects ? fresh.filter((m) => !m.detail) : fresh,
    fresh,
    sheets,
    /** 事業と中の事業に紐付いた施策・評価シート */
    measuresFor: (p: ProjectFull) => measures.filter((m) => m.detail && p.initialDetails.includes(m.detail)),
    sheetsFor: (p: ProjectFull) => sheets.filter((s) => s.detail && p.settlementDetails.includes(s.detail)),
    isNew,
    isEnded,
    kind: y.kind,
    hasPrev,
    // 前の年度と比べられるのは、DB に事業の収録があり、前の年度もある頁だけ（事業の収録の無い自治体は NEW・やめたを出さない）
    comparable: hasPrev && d.hasProjects,
    /** 頁の金額が当初予算か決算か */
    word: y.kind === 'settlement' ? '決算' : '予算',
    /** その年度の並びに使う額の名前 */
    label: (year: number) => (d.kinds[String(year)] === 'settlement' ? '決算' : '当初予算'),
  }
}

/** 今後の方向性の区分（API の outlook.code）ごとの印。言い方は API の outlook.label */
export const DIRECTION_ICONS: Record<DirectionCode, string> = {
  new: 'new',
  expand: 'up',
  keep: 'keep',
  statutory: 'law',
  as_planned: 'plan',
  improve: 'fix',
  resize: 'size',
  reduce: 'cut',
  merge: 'join',
  complete: 'done',
  end: 'stop',
  consider_end: 'maybe',
}

/** シートの方向性の印と言い方。区分が当たらないシートは undefined */
export function directionOf(s: Pick<Sheet, 'dc' | 'dl'>): { code: DirectionCode; icon: string; label: string } | undefined {
  return s.dc ? { code: s.dc, icon: DIRECTION_ICONS[s.dc], label: s.dl ?? '' } : undefined
}

export const GRADES = [
  ['A', '広げる'],
  ['B', '続ける'],
  ['C', '見直す'],
  ['D', '終える'],
] as const
