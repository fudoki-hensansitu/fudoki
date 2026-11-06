// 自治体一覧の比較表。表は30件ずつ読み込むので、並べ替え・絞り込みはサーバー（/api/jurisdictions/table）で行い、画面は続きを足していく。
// 地図・検索・絞り込みの候補には、全自治体の軽い要約（MapEntry）だけを頁に載せる
import type { IndexEntry } from './types'

/** 1回に返す行数 */
export const INDEX_PAGE_SIZE = 30
/** 絞り込みで指定できる自治体・都道府県の数（URL が際限なく長くならないよう） */
const MAX_CODES = 2000
const MAX_OFFSET = 100_000

export const INDEX_SORTS = ['name', 'population', 'perCapita', 'yen'] as const
export type IndexSort = (typeof INDEX_SORTS)[number]

export interface IndexQuery {
  sort: IndexSort
  desc: boolean
  offset: number
  /** 都道府県（自治体コードの先頭2桁）。どれかに当たれば残す */
  prefs: string[]
  /** 市区町村の自治体コード。どれかに当たれば残す。prefs とは AND */
  codes: string[]
}

export const DEFAULT_INDEX_QUERY: IndexQuery = { sort: 'perCapita', desc: true, offset: 0, prefs: [], codes: [] }

export interface IndexTable {
  rows: IndexEntry[]
  /** 絞り込みに当たった自治体の数 */
  total: number
  /** 続きの offset。終わりなら null */
  next: number | null
}

/** 地図・検索・絞り込みの候補に使う自治体の要約 */
export type MapEntry = Pick<IndexEntry, 'code' | 'name' | 'prefecture' | 'kind' | 'path' | 'yen'>
export const toMapEntry = ({ code, name, prefecture, kind, path, yen }: IndexEntry): MapEntry => ({ code, name, prefecture, kind, path, yen })

const valueOf = (e: IndexEntry, sort: IndexSort): number | string | null =>
  sort === 'name' ? e.code : sort === 'population' ? (e.population?.people ?? null) : sort === 'perCapita' ? e.perCapita : e.yen

/** 絞り込んで並べ、offset から1頁分を返す。値の無い自治体（人口が無いなど）はどちらの向きでも末尾、同じ値は自治体コードの順 */
export function queryIndex(entries: IndexEntry[], q: IndexQuery): IndexTable {
  const prefs = new Set(q.prefs)
  const codes = new Set(q.codes)
  const hit = entries.filter((e) => (!prefs.size || prefs.has(e.code.slice(0, 2))) && (!codes.size || codes.has(e.code)))
  const sign = q.desc ? -1 : 1
  hit.sort((a, b) => {
    const x = valueOf(a, q.sort)
    const y = valueOf(b, q.sort)
    if (x === null || y === null) return x === y ? a.code.localeCompare(b.code) : x === null ? 1 : -1
    return (x < y ? -sign : x > y ? sign : 0) || a.code.localeCompare(b.code)
  })
  const end = q.offset + INDEX_PAGE_SIZE
  return {
    rows: hit.slice(q.offset, end),
    total: hit.length,
    next: end < hit.length ? end : null,
  }
}

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

/** URL の検索条件を読む。形の違う値は投げる（呼び出し側が 400 にする） */
export function parseIndexQuery(params: URLSearchParams): IndexQuery {
  const sort = params.get('sort') ?? DEFAULT_INDEX_QUERY.sort
  const order = params.get('order') ?? 'desc'
  const offset = Number(params.get('offset') ?? '0')
  const prefs = list(params.get('pref'))
  const codes = list(params.get('code'))
  if (!(INDEX_SORTS as readonly string[]).includes(sort)) throw new RangeError('sort が違います')
  if (order !== 'asc' && order !== 'desc') throw new RangeError('order が違います')
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) throw new RangeError('offset が違います')
  if (prefs.length > 47 || !prefs.every((p) => /^\d{2}$/.test(p))) throw new RangeError('pref が違います')
  if (codes.length > MAX_CODES || !codes.every((c) => /^\d{6}$/.test(c))) throw new RangeError('code が違います')
  return { sort: sort as IndexSort, desc: order === 'desc', offset, prefs, codes }
}

/** parseIndexQuery が読める形の検索条件（既定値は省く） */
export function indexQueryString(q: IndexQuery): string {
  const p = new URLSearchParams({ sort: q.sort, order: q.desc ? 'desc' : 'asc' })
  if (q.offset) p.set('offset', String(q.offset))
  if (q.prefs.length) p.set('pref', q.prefs.join(','))
  if (q.codes.length) p.set('code', q.codes.join(','))
  return p.toString()
}
