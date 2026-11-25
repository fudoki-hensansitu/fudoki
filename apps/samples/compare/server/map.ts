// まち比べの頁の loader が本体から読む、東京都のまちの問いごとの値（本体の /data/compare-map.json。本体の CDN に1時間置かれる）
import type { CompareMap } from '@fudoki/fiscal/compare'
import { fudokiFetch, type Env } from '../../server/fudoki'

export const EMPTY_MAP: CompareMap = { prefecture: '', cols: 0, rows: 0, year: null, towns: [], partial: false }

/** 地図のデータ。読めなければ投げる */
export async function loadCompareMap(env: Env, from: Headers): Promise<CompareMap> {
  const r = await fudokiFetch(env, from, '/data/compare-map.json')
  if (!r.ok) throw new Error(`風土記に繋がりませんでした（${r.status}）`)
  return (await r.json()) as CompareMap
}
