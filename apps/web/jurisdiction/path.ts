// 自治体の個別ページの URL（/tokyo/nakano）。ローマ字は自治体マスタ（packages/jurisdictions）の slug が正本。
// 画面の bundle に registry を載せないよう、types.ts とは分けて server 側だけが import する
import prefectures from '../../../packages/jurisdictions/prefectures.json'
import registry from '../../../packages/jurisdictions/jurisdictions.json'

const PREFECTURES: Record<string, string> = prefectures.slugs
const SLUGS = new Map(Object.entries(registry.jurisdictions as Record<string, { slug?: string }>).map(([code, j]) => [code, j.slug]))

export const PREFECTURE_SLUGS = new Set(Object.values(PREFECTURES))

/** 全国地方公共団体コードから URL の path を作る。マスタに slug が無い自治体はコードで代える */
export const jurisdictionPath = (code: string) => `/${PREFECTURES[code.slice(0, 2)]}/${SLUGS.get(code) ?? code}`
