// 試作: 比べる（/prototype/compare?codes=131091,131032）。2〜4 のまちを、同じ年度の決算（一般会計）の分野ごとの額と1人あたりで並べる。
// 分野ごとの額は自治体の頁のお金の流れ（COFOG の大分類）と同じものを使い、ここで新しく集計しない
import { defineHandler, defineHead } from 'void'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../../jurisdiction/domains'
import { jurisdictionPath } from '../../jurisdiction/path'
import { populationForYear, type Drill } from '../../jurisdiction/types'
import { loadCofogFlow } from '../../server/jurisdiction'
import { catalog, homeEntries, memo } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'
import type { MapEntry } from '../../jurisdiction/index-table'
import neighbors from '../../prototype/neighbors.json'

export const MAX_COMPARE = 4
const DEFAULT = ['131091']

export type CompareTown = { code: string; name: string; path: string; year: number; total: number; people: number | null; asOf: string | null; fields: Record<string, number> }
export type Props = { towns: CompareTown[]; year: number | null; entries: MapEntry[]; suggestions: { code: string; name: string }[]; missing: string[] }

const fieldOf = (id: string) => DOMAIN_FRAMES.find((f) => `cofog-${f.cofog}` === id)?.id ?? OTHER_FRAME.id

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const asked = (c.req.query('codes') ?? '').split(',').filter((x) => /^\d{6}$/.test(x))
  const codes = [...new Set(asked.length ? asked : DEFAULT)].slice(0, MAX_COMPARE)
  const [cat, entries] = await Promise.all([catalog(env), homeEntries(env).catch(() => [] as MapEntry[])])
  const picked = codes.flatMap((code) => cat.filter((e) => e.code === code && e.settlementYears.length > 0))
  // 全部のまちに決算がある、いちばん新しい年度で揃える
  const common = picked.reduce<number[] | null>((acc, e) => (acc ? acc.filter((y) => e.settlementYears.includes(y)) : [...e.settlementYears]), null) ?? []
  const year = common.at(-1) ?? null
  const towns: CompareTown[] = year
    ? await Promise.all(
        picked.map(async (e) => {
          const flow = await memo<Drill[]>(`flow-cofog-settlement-${e.code}-${year}-kou`, () => loadCofogFlow(env, e.code, year, 'kou', 'settlement'))
          const fields: Record<string, number> = {}
          for (const d of flow) fields[fieldOf(d.kan.id)] = (fields[fieldOf(d.kan.id)] ?? 0) + d.kan.yen
          const pop = populationForYear(e.populations, year)
          return { code: e.code, name: e.name, path: jurisdictionPath(e.code), year, total: flow.reduce((s, d) => s + d.kan.yen, 0), people: pop?.people ?? null, asOf: pop?.asOf ?? null, fields }
        }),
      )
    : []
  // となりのまち（境界で接しているまち）を、足す候補にする
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const near = codes.flatMap((code) => (neighbors as Record<string, string[]>)[code] ?? [])
  const suggestions = [...new Set(near)].filter((x) => !codes.includes(x) && byCode.has(x)).map((x) => ({ code: x, name: byCode.get(x)!.name }))
  const missing = codes.filter((code) => !picked.some((e) => e.code === code))
  return { towns, year, entries, suggestions, missing }
})

export const head = defineHead(() => ({ title: '比べる（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
