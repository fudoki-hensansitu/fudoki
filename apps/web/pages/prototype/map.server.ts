// 試作: 地図で選ぶ（/prototype/map）。東京のまちの形を描き、押すとそのまちへ。塗るのは収録の有無とうちのまちだけで、金額では塗り分けない
import { defineHandler, defineHead } from 'void'
import { homeEntries } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'
import type { MapEntry } from '../../jurisdiction/index-table'
import shapes from '../../prototype/shapes.json'

export type Shape = { code: string; name: string; d: string; path: string | null }
export type Props = { width: number; height: number; shapes: Shape[]; islands: MapEntry[]; others: MapEntry[] }

export const loader = defineHandler<Props>(async (c) => {
  const entries = await homeEntries(c.env as unknown as Env).catch(() => [] as MapEntry[])
  const byCode = new Map(entries.map((e) => [e.code, e]))
  const drawn = new Set(shapes.map.towns.map((t) => t.code))
  return {
    width: shapes.map.width,
    height: shapes.map.height,
    shapes: shapes.map.towns.map((t) => ({ ...t, path: byCode.get(t.code)?.path ?? null })),
    islands: entries.filter((e) => e.prefecture === '東京都' && e.kind !== '都道府県' && !drawn.has(e.code)),
    others: entries.filter((e) => e.prefecture !== '東京都' || e.kind === '都道府県'),
  }
})

export const head = defineHead(() => ({ title: '地図で選ぶ（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
