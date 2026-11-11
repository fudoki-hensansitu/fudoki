// ホームの検索（うちのまち）・収録の更新に使う、全自治体の軽い要約
import type { IndexEntry } from './types'

/** 検索の候補に使う自治体の要約 */
export type MapEntry = Pick<IndexEntry, 'code' | 'name' | 'prefecture' | 'kind' | 'path' | 'yen'> & {
  /** 自治体の頁の最新の年度（決算より後の当初予算があればその年度）。頁へのリンクはこの年度の段を付ける */
  latestYear?: number
}
export const toMapEntry = ({ code, name, prefecture, kind, path, yen }: IndexEntry, latestYear?: number): MapEntry => ({ code, name, prefecture, kind, path, yen, ...(latestYear !== undefined ? { latestYear } : {}) })
