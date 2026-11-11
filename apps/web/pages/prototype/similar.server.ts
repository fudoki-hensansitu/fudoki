// 試作: 似たまちを探す（/prototype/similar?code=131091）。人口と面積が近いまちを、比べる相手の候補に出す。良し悪しの順ではなく、近さの順
import { defineHandler, defineHead } from 'void'
import { homeEntries, catalog } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'
import type { MapEntry } from '../../jurisdiction/index-table'
import shapes from '../../prototype/shapes.json'

export type Town = { code: string; name: string; path: string; kind: string; prefecture: string; people: number | null; asOf: string | null; area: number | null }
export type Props = { code: string | null; towns: Town[] }

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const [entries, cat] = await Promise.all([homeEntries(env).catch(() => [] as MapEntry[]), catalog(env)])
  const pop = new Map(cat.map((e) => [e.code, e.population]))
  const areas = shapes.areas as Record<string, number>
  const code = c.req.query('code')
  return {
    code: code && /^\d{6}$/.test(code) ? code : null,
    towns: entries
      .filter((e) => e.kind !== '都道府県')
      .map((e) => ({ code: e.code, name: e.name, path: e.path, kind: e.kind, prefecture: e.prefecture, people: pop.get(e.code)?.people ?? null, asOf: pop.get(e.code)?.asOf ?? null, area: areas[e.code] ?? null })),
  }
})

export const head = defineHead(() => ({ title: '似たまちを探す（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
