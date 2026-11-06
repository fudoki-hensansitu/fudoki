// 自治体ページの「分野ごとの事業」の枠。どの自治体でも同じ枠で出すため、手で枠を決めず COFOG（政府支出の機能別分類。
// 10分類で支出を漏れなく分ける）を有権者に伝わる単位にまとめ直す。事業に COFOG を付ければ枠が一つに決まる
// 並びは市民の関心の高い順（区市の世論調査で「力を入れてほしい施策」の上位に来る防災・子育て・高齢者福祉を先に置く）。
// 枠の名前・COFOG のまとめ方・並びは風土記の判断

export interface DomainFrame {
  id: string
  name: string
  /** この枠に入る COFOG コードの前方一致。長い（細かい）コードが優先する */
  cofog: string[]
}

export const DOMAIN_FRAMES: DomainFrame[] = [
  { id: 'bosai', name: '防災・安全', cofog: ['03'] },
  { id: 'kosodate', name: '子育て・教育', cofog: ['09', '10.4'] },
  { id: 'iryo', name: '医療・介護・福祉', cofog: ['07', '10'] },
  { id: 'kurashi', name: '暮らし・まち', cofog: ['06', '04.5'] },
  { id: 'sangyo', name: '産業・しごと', cofog: ['04'] },
  { id: 'kankyo', name: '環境', cofog: ['05'] },
  { id: 'gyosei', name: '行政・お金の使い方', cofog: ['01', '02'] },
  { id: 'bunka', name: '文化・スポーツ', cofog: ['08'] },
]

const covers = (prefix: string, code: string) => code === prefix || code.startsWith(`${prefix}.`)

/** COFOG コードが入る枠。最も細かく一致した前方一致の枠を返す */
export function frameOf(cofog: string): DomainFrame | undefined {
  let best: { frame: DomainFrame; len: number } | undefined
  for (const frame of DOMAIN_FRAMES) {
    for (const prefix of frame.cofog) {
      if (covers(prefix, cofog) && (!best || prefix.length > best.len)) best = { frame, len: prefix.length }
    }
  }
  return best?.frame
}

/** 事業を枠ごとに並べる。事業の無い枠は出さない。並びは DOMAIN_FRAMES の順、枠の中は元の順 */
export function groupByFrame<T extends { cofog: string }>(items: T[]): { frame: DomainFrame; items: T[] }[] {
  return DOMAIN_FRAMES.map((frame) => ({ frame, items: items.filter((p) => frameOf(p.cofog) === frame) })).filter((g) => g.items.length)
}
