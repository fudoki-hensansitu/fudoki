// 自治体の個別ページの URL（/tokyo/nakano）。ローマ字は自治体マスタ（packages/jurisdictions）の slug が正本。
// 画面の bundle に registry を載せないよう、types.ts とは分けて server 側だけが import する
import prefectures from '../../../packages/jurisdictions/prefectures.json'
import registry from '../../../packages/jurisdictions/jurisdictions.json'

const PREFECTURES: Record<string, string> = prefectures.slugs
const SLUGS = new Map(Object.entries(registry.jurisdictions as Record<string, { slug?: string }>).map(([code, j]) => [code, j.slug]))

/** 自治体の頁の下に置くテーマの段（/tokyo/shinagawa/elections）。都道府県自体のテーマ（/tokyo/elections）と
 * 市区町村（/tokyo/shinagawa）が同じ段に並ぶので、市区町村の slug に使わない（テストで確かめる）。テーマを足すときはここにも足す */
export const TOPIC_SEGMENTS = new Set(['spending', 'revenue', 'elections', 'budget', 'settlement'])

export const PREFECTURE_SLUGS = new Set(Object.values(PREFECTURES))

/** 全国地方公共団体コードから URL の path を作る。マスタに slug が無い自治体はコードで代える。
 * 都道府県自体（コードの3〜5桁目が 000。東京都は 130001）は /tokyo にする（/tokyo/tokyo にしない） */
export const jurisdictionPath = (code: string) => {
  const prefecture = `/${PREFECTURES[code.slice(0, 2)]}`
  return code.slice(2, 5) === '000' ? prefecture : `${prefecture}/${SLUGS.get(code) ?? code}`
}

let codesByPath: Map<string, string> | undefined
/** jurisdictionPath の逆。自治体マスタに無い自治体は path の最後の段が6桁のコードそのもの（jurisdictionPath がコードで代える）。都道府県の slug でない path・知らない名前は undefined */
export const codeOfPath = (path: string): string | undefined => {
  codesByPath ??= new Map([...SLUGS.keys()].map((code) => [jurisdictionPath(code), code]))
  const hit = codesByPath.get(path)
  if (hit) return hit
  const [, prefectureSlug, name, ...rest] = path.split('/')
  const prefecture = Object.entries(PREFECTURES).find(([, slug]) => slug === prefectureSlug)?.[0]
  return prefecture && name && rest.length === 0 && /^\d{6}$/.test(name) && name.startsWith(prefecture) && name.slice(2, 5) !== '000' ? name : undefined
}
