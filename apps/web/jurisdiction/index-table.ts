// ホームの検索（うちのまち）・サイドバーの検索に使う、全自治体の軽い要約
import type { JurisdictionKind } from './types'

/** 検索の候補に使う自治体の要約。決算を収録している自治体だけを載せる */
export type MapEntry = {
  code: string
  name: string
  prefecture: string
  kind: JurisdictionKind
  /** 個別ページの path（/tokyo/shinagawa） */
  path: string
  /** 自治体の頁の最新の年度（決算より後の当初予算があればその年度）。頁へのリンクはこの年度の段を付ける */
  latestYear?: number
}
