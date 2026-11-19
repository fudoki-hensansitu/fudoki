// ホームの検索（うちのまち）・サイドバーの検索の候補に出す、自治体の軽い要約（探す語との当て方は api の list_jurisdictions が持つ）
import type { JurisdictionKind } from './types'

/** 検索の候補に使う自治体の要約。決算を収録している自治体だけを載せる */
export type MapEntry = {
  code: string
  name: string
  prefecture: string
  kind: JurisdictionKind
  /** 個別ページの path（/tokyo/shinagawa） */
  path: string
}
