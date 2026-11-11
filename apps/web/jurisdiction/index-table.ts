// ホームの検索（うちのまち）・収録の更新に使う、全自治体の軽い要約
import type { IndexEntry } from './types'

/** 検索の候補に使う自治体の要約 */
export type MapEntry = Pick<IndexEntry, 'code' | 'name' | 'prefecture' | 'kind' | 'path' | 'yen'>
export const toMapEntry = ({ code, name, prefecture, kind, path, yen }: IndexEntry): MapEntry => ({ code, name, prefecture, kind, path, yen })
