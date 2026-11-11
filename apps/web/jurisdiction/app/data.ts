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
  /** 年度ごとの当初予算（b）と決算（s） */
  y: Record<string, Amounts>
  /** 年度ごとの中の事業（名前・金額）。金額の多い順 */
  kids: Record<string, [string, number | null][]>
}
export type Measure = { id: string; fy: number; title: string; new: boolean; yen: number | null; desc: string[]; project: string | null; field: string; url: string; page: number }
export type Sheet = { id: string; fy: number; name: string; grade: 'A' | 'B' | 'C' | 'D'; dir: string | null; div: string | null; acct: string; b: number | null; s: number | null; project: string | null; field: string; url: string; page: number }
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
}

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
  const ended = hasPrev ? d.projects.filter((p) => amt(p, prev) != null && budget(p) == null).sort((a, b) => amt(b, prev)! - amt(a, prev)!) : []
  const measures = d.measures.filter((m) => m.fy === year)
  const measuresOf = group(measures, (m) => m.project)
  const appeared = (p: Proj) => hasPrev && budget(p) != null && amt(p, prev) == null
  const isNew = (p: Proj) => appeared(p) || (measuresOf.get(p.id) ?? []).some((m) => m.new)
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
    isEnded: (p: Proj) => hasPrev && amt(p, prev) != null && budget(p) == null,
    kind: y.kind,
    hasPrev,
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

/** 評価シートの「今後の方向」の表記ごとの印と言い方 */
export const DIRECTIONS: Record<string, { icon: string; label: string }> = {
  新規の取組み: { icon: 'new', label: '新しい取り組みを始める' },
  '対象・規模等の拡大': { icon: 'up', label: '対象・規模を広げる' },
  現状維持: { icon: 'keep', label: '今のまま続ける' },
  '法定受託事務・法定扶助費等': { icon: 'law', label: '法令で決まっている' },
  '計画・規定どおり': { icon: 'plan', label: '計画どおり続ける' },
  手法等の改善: { icon: 'fix', label: 'やり方を見直す' },
  '対象・規模等の見直し': { icon: 'size', label: '対象・規模を見直す' },
  取組みの一部廃止: { icon: 'cut', label: '一部をやめる' },
  事業の完了: { icon: 'done', label: '完了した' },
  '事業移管・統合': { icon: 'join', label: 'ほかの事業へ統合' },
  事業の廃止: { icon: 'stop', label: 'やめた' },
  事業の廃止等に向けた検討: { icon: 'maybe', label: 'やめるか検討中' },
}

export const GRADES = [
  ['A', '広げる'],
  ['B', '続ける'],
  ['C', '見直す'],
  ['D', '終える'],
] as const
