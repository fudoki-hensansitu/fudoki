// ホームの検索（うちのまち）・サイドバーの検索に使う、自治体の軽い要約と、探す語との当て方
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

/** 自治体を探す語に当たるか。名前・ローマ字の path に含まれるか、都道府県名の頭に合えば当てる（「東京」で都内を全部出し、「京都」で東京都は出さない） */
export const townMatches = (e: Pick<MapEntry, 'name' | 'prefecture' | 'path'>, q: string) => {
  const s = q.trim()
  return !s || e.name.includes(s) || e.prefecture.startsWith(s) || e.path.includes(s.toLowerCase())
}
