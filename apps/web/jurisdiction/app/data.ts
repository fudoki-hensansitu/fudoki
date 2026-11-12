// 自治体の頁（アプリ型）のデータ。server/app-data.ts が API から組んだものを、年度ごとの見え方に組み直す。
// 事業・施策（予算案のプレス発表）・評価シートの3つのオブジェクトを、事業を中心につなぐ
import { DOMAIN_FRAMES, OTHER_FRAME, type DomainFrame } from '../domains'

export type Amounts = { b?: number | null; s?: number | null }
export type Proj = {
  id: string
  name: string
  dept: string | null
  path: (string | null)[]
  field: string
  /** 始めた年度（前の年度の資料にこの事業が無かったと確かめられたときだけ。DB の事業の first_year） */
  started: number | null
  /** 終えた年度（次の年度の資料にこの事業が無かったと確かめられたときだけ。DB の事業の last_year） */
  ended: number | null
  /** 年度ごとの当初予算（b）と決算（s） */
  y: Record<string, Amounts>
  /** 年度ごとの中の事業（名前・金額）。金額の多い順 */
  kids: Record<string, [string, number | null][]>
}
export type Measure = { id: string; fy: number; title: string; new: boolean; yen: number | null; desc: string[]; project: string | null; field: string; url: string; /** 出典の origin_id。アシスタントが read_source_page で頁を読むのに使う */ origin: string; page: number }
export type DirectionCode = 'new' | 'expand' | 'keep' | 'statutory' | 'as_planned' | 'improve' | 'resize' | 'reduce' | 'merge' | 'complete' | 'end' | 'consider_end'
export type Sheet = { id: string; fy: number; name: string; grade: 'A' | 'B' | 'C' | 'D' | null; dir: string | null; dc: DirectionCode | null; /** 方向性の区分の言い方（API の outlook.label） */ dl: string | null; div: string | null; acct: string; b: number | null; s: number | null; project: string | null; field: string; url: string; /** 出典の origin_id。アシスタントが read_source_page で頁を読むのに使う */ origin: string; page: number }
/** 予算書の款・項・目（当初予算）。上から下へ見ていく予算のタブに使う */
export type Kan = { name: string; yen: number; kou: { name: string; yen: number; moku: { name: string; yen: number; field: string }[] }[] }
export type Snapshot = {
  code: string
  name: string
  pop: number
  years: Record<string, { /** 当初予算（initial）か、当初予算の無い年度の決算（settlement）か */ kind: 'initial' | 'settlement'; kan: Kan[]; total: number; fields: Record<string, number>; origin: string | null; originTitle: string | null }>
  projects: Proj[]
  measures: Measure[]
  sheets: Sheet[]
  /** 中の事業（kids）・施策・評価シートを持っている年度。無ければ全部の年度 */
  loaded?: number[]
}

/** 頁の年度の分だけにしたもの。年度ごとの総額・事業の年度ごとの金額は前の年度との比べに使うので全部残し、
 * 大きい中の事業・施策・評価シートだけをその年度に絞る（品川区は全年度で約540KB、1年度で約170〜320KB） */
export function sliceSnapshot(d: Snapshot, year: number): Snapshot {
  const ys = String(year)
  return {
    ...d,
    projects: d.projects.map((p) => ({ ...p, kids: p.kids[ys] ? { [ys]: p.kids[ys] } : {} })),
    measures: d.measures.filter((m) => m.fy === year),
    sheets: d.sheets.filter((s) => s.fy === year),
    loaded: [year],
  }
}

/** 年度ごとに取った分を足し合わせる。同じ自治体の同じ版（server の cache が同じ）から切り出したものだけを渡す */
export function mergeSnapshot(a: Snapshot, b: Snapshot): Snapshot {
  const have = loadedYears(a)
  const add = loadedYears(b).filter((y) => !have.includes(y))
  if (!add.length) return a
  const fresh = (fy: number) => add.includes(fy)
  const kids = new Map(b.projects.map((p) => [p.id, p.kids]))
  const ids = new Set(a.projects.map((p) => p.id))
  return {
    ...a,
    projects: [
      ...a.projects.map((p) => ({ ...p, kids: { ...p.kids, ...Object.fromEntries(Object.entries(kids.get(p.id) ?? {}).filter(([y]) => fresh(Number(y)))) } })),
      ...b.projects.filter((p) => !ids.has(p.id)),
    ],
    measures: [...a.measures, ...b.measures.filter((m) => fresh(m.fy))],
    sheets: [...a.sheets, ...b.sheets.filter((s) => fresh(s.fy))],
    loaded: [...have, ...add],
  }
}

/** 中の事業・施策・評価シートを持っている年度 */
export const loadedYears = (d: Snapshot) => d.loaded ?? Object.keys(d.years).map(Number)

export type Field = DomainFrame & { yen: number }

/** 分野は金額の多い順。その他は常に最後 */
const byYenOtherLast = (a: Field, b: Field) => Number(a.id === 'other') - Number(b.id === 'other') || b.yen - a.yen

export type YearView = ReturnType<typeof yearView>

export function yearView(d: Snapshot, year: number) {
  const ys = String(year)
  const prev = String(year - 1)
  const hasPrev = !!d.years[prev]
  const y = d.years[ys]!
  const fields: Field[] = [...DOMAIN_FRAMES, OTHER_FRAME].map((f) => ({ ...f, yen: y.fields[f.id] ?? 0 })).filter((f) => f.yen > 0).sort(byYenOtherLast)
  // 当初予算の無い年度は決算の額で並べる
  const amt = (p: Proj, year: string) => (d.years[year]?.kind === 'settlement' ? p.y[year]?.s : p.y[year]?.b)
  const budget = (p: Proj) => amt(p, ys)
  const current = d.projects.filter((p) => budget(p) != null).sort((a, b) => budget(b)! - budget(a)!)
  // やめた事業は前の年度で終えた事業（DB の事業の終えた年度）だけ
  const isEnded = (p: Proj) => p.ended === year - 1
  // 前の年度と比べられるのは、DB に事業の収録があり、前の年度もある頁だけ（事業の収録の無い自治体は NEW・やめたを出さない）
  const comparable = hasPrev && d.projects.some((p) => p.started != null || p.ended != null)
  const ended = d.projects.filter(isEnded).sort((a, b) => (amt(b, prev) ?? 0) - (amt(a, prev) ?? 0))
  const measures = d.measures.filter((m) => m.fy === year)
  const measuresOf = group(measures, (m) => m.project)
  // NEW はその年度に始めた事業（予算書に新しく出てきた事業）だけ。施策の新規はこの印に使わない
  const isNew = (p: Proj) => p.started === year
  const currentIds = new Set(current.map((p) => p.id))
  const fresh = measures.filter((m) => m.new).sort((a, b) => (b.yen ?? 0) - (a.yen ?? 0))
  // 評価シートは評価した事業を行った年度の頁に出す（R6 の事業の評価は R6 の頁）。まだ評価の無い年度は出さない
  const sheets = d.sheets.filter((s) => s.fy === year)
  return {
    year,
    total: y.total,
    /** 人口の無い自治体は null */
    perHead: d.pop ? y.total / d.pop : null,
    origin: y.origin,
    originTitle: y.originTitle,
    fields,
    current,
    ended,
    newProjects: current.filter(isNew),
    freshUnlinked: fresh.filter((m) => !m.project || !currentIds.has(m.project)),
    fresh,
    measuresOf,
    sheets,
    sheetsOf: group(sheets, (s) => s.project),
    isNew,
    isEnded,
    kind: y.kind,
    hasPrev,
    comparable,
    /** 頁の金額が当初予算か決算か */
    word: y.kind === 'settlement' ? '決算' : '予算',
    /** その年度の並びに使う額の名前 */
    label: (year: number) => (d.years[String(year)]?.kind === 'settlement' ? '決算' : '当初予算'),
    amount: (p: Proj, year = ys) => amt(p, year),
  }
}

function group<T>(items: T[], key: (t: T) => string | null) {
  const m = new Map<string, T[]>()
  for (const t of items) {
    const k = key(t)
    if (!k) continue
    const a = m.get(k) ?? []
    a.push(t)
    m.set(k, a)
  }
  return m
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
