// 試作（アプリ型の自治体の頁）のデータ。本番 API から取った品川区の写し（public/prototype/shinagawa.json）を年度ごとの見え方に組み直す。
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
export type Snapshot = {
  code: string
  name: string
  pop: number
  years: Record<string, { total: number; fields: Record<string, number>; origin: string | null; originTitle: string | null }>
  projects: Proj[]
  measures: Measure[]
  sheets: Sheet[]
}

export type Field = DomainFrame & { yen: number }

/** 分野は金額の多い順。その他は常に最後 */
const byYenOtherLast = (a: Field, b: Field) => Number(a.id === 'other') - Number(b.id === 'other') || b.yen - a.yen

export type YearView = ReturnType<typeof yearView>

/** 評価シートは評価した事業を行った年度で持つ。表示する年度の2年前の事業の評価を出す（R8 の頁なら R6 の事業） */
export const EVAL_LAG = 2

export function yearView(d: Snapshot, year: number) {
  const ys = String(year)
  const prev = String(year - 1)
  const hasPrev = !!d.years[prev]
  const y = d.years[ys]!
  const fields: Field[] = [...DOMAIN_FRAMES, OTHER_FRAME].map((f) => ({ ...f, yen: y.fields[f.id] ?? 0 })).filter((f) => f.yen > 0).sort(byYenOtherLast)
  const budget = (p: Proj) => p.y[ys]?.b
  const current = d.projects.filter((p) => budget(p) != null).sort((a, b) => budget(b)! - budget(a)!)
  const ended = hasPrev ? d.projects.filter((p) => p.y[prev]?.b != null && budget(p) == null).sort((a, b) => b.y[prev]!.b! - a.y[prev]!.b!) : []
  const measures = d.measures.filter((m) => m.fy === year)
  const measuresOf = group(measures, (m) => m.project)
  const appeared = (p: Proj) => hasPrev && budget(p) != null && p.y[prev]?.b == null
  const isNew = (p: Proj) => appeared(p) || (measuresOf.get(p.id) ?? []).some((m) => m.new)
  const currentIds = new Set(current.map((p) => p.id))
  const fresh = measures.filter((m) => m.new).sort((a, b) => (b.yen ?? 0) - (a.yen ?? 0))
  const sheets = d.sheets.filter((s) => s.fy === year - EVAL_LAG)
  return {
    year,
    total: y.total,
    perHead: y.total / d.pop,
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
    isEnded: (p: Proj) => hasPrev && p.y[prev]?.b != null && budget(p) == null,
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
