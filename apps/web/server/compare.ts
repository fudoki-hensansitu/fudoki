// 比べる頁（/compare）のデータ。一つの年度の、収録している全部のまちの一般会計の決算を、目ごとに分野（COFOG の大分類）へ分けて足す。
// 似たまちを探すのに全部のまちが要るので、まちごとではなく年度ごとに読む。足すのは同じまちの目の金額だけで、まちどうしは足さない
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import { ACCOUNT } from './jurisdiction'
import { apiCall } from './fudoki-api'
import type { Env } from './env'

export type FieldTotals = { total: number; fields: Record<string, number> }

// 頁は query ごとに CDN に置くが、まちの組み合わせごとに全部のまちを読み直さないよう、同じ isolate の中では年度ごとに使い回す。
// データは取り込みのときだけ変わるので、CDN の置き時間（void.config.ts の 3600 秒）と同じだけ持つ
const REUSE_MS = 3_600_000
const memo = new WeakMap<Env, Map<number, { at: number; p: Promise<Map<string, FieldTotals>> }>>()

async function read(env: Env, year: number): Promise<Map<string, FieldTotals>> {
  const out = new Map<string, FieldTotals>()
  let token: string | undefined
  do {
    const r = await apiCall(env)('search_expenditure_subjects', {
      document_kind: 'settlement',
      fiscal_year: { min: year, max: year },
      where: { account_name: { eq: [ACCOUNT] }, level: { eq: ['目'] } },
      page_size: 1000,
      ...(token ? { page_token: token } : {}),
    })
    for (const s of r.subjects) {
      const t = out.get(s.jurisdiction_code) ?? { total: 0, fields: {} }
      const yen = s.amount_yen ?? 0
      const field = ((s.cofog_code ? frameOf(s.cofog_code) : undefined) ?? OTHER_FRAME).id
      t.fields[field] = (t.fields[field] ?? 0) + yen
      t.total += yen
      out.set(s.jurisdiction_code, t)
    }
    token = r.next_page_token ?? undefined
  } while (token)
  return out
}

/** 年度の、まちごとの分野の合計 */
export function fieldTotalsOf(env: Env, year: number): Promise<Map<string, FieldTotals>> {
  const byYear = memo.get(env) ?? new Map()
  memo.set(env, byYear)
  const hit = byYear.get(year)
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.p
  const p = read(env, year)
  byYear.set(year, { at: Date.now(), p })
  p.catch(() => byYear.get(year)?.p === p && byYear.delete(year))
  return p
}

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
