// まち比べ（/compare）の似たまちの探し方。分野の額は自治体の一覧の歳出の根の額（server/jurisdiction.ts の fieldTotals）を使う
import type { FieldTotals } from './jurisdiction'

/** 使い方が近いまち。分野ごとの1人あたりの金額の差（の絶対値）の和が小さい順。base は割る数（人口）。人口の無いまちは候補にしない */
export function closestByUse(me: FieldTotals & { base: number }, others: [code: string, FieldTotals & { base: number }][], n: number): string[] {
  const fields = [...new Set([me, ...others.map(([, t]) => t)].flatMap((t) => Object.keys(t.fields)))]
  const per = (t: FieldTotals & { base: number }, f: string) => (t.fields[f] ?? 0) / t.base
  const dist = (t: FieldTotals & { base: number }) => fields.reduce((s, f) => s + Math.abs(per(t, f) - per(me, f)), 0)
  return others
    .filter(([, t]) => t.base > 0)
    .map(([code, t]) => [code, dist(t)] as const)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([code]) => code)
}

/** 人口が近いまち。比（何倍か）で近さを測る */
export function closestByPopulation(me: number, others: [code: string, number][], n: number): string[] {
  return others.map(([code, pop]) => [code, Math.abs(Math.log(pop / me))] as const).sort((a, b) => a[1] - b[1]).slice(0, n).map(([code]) => code)
}
