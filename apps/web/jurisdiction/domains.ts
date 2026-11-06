// 自治体ページの「新しく始めた・広げた事業」の枠。どの自治体でも同じ枠で出すため、手で枠を決めず COFOG（政府支出の機能別分類。
// 10分類で支出を漏れなく分ける）を有権者に伝わる単位にまとめ直す。事業に COFOG を付ければ枠が一つに決まる
// 並びは市民の関心の高い順（区市の世論調査で「力を入れてほしい施策」の上位に来る防災・子育て・高齢者福祉を先に置く）。
// 枠の名前・COFOG のまとめ方・並びは風土記の判断

export interface DomainFrame {
  id: string
  name: string
  /** この枠に入る COFOG コードの前方一致。長い（細かい）コードが優先する */
  cofog: string[]
  /** 区政を知らない人向けの、この枠に入る自治体の仕事の例。COFOG の振り分け規則（cofog_rules）と食い違わないものだけ */
  examples: string
}

export const DOMAIN_FRAMES: DomainFrame[] = [
  { id: 'bosai', name: '防災・安全', cofog: ['03'] , examples: '避難所・防災の備え・防犯' },
  { id: 'kosodate', name: '子育て・教育', cofog: ['09', '10.4'] , examples: '保育園・小中学校・学童' },
  { id: 'iryo', name: '医療・介護・福祉', cofog: ['07', '10'] , examples: '健診・介護・障害のある人の支援・生活保護' },
  { id: 'kurashi', name: '暮らし・まち', cofog: ['06', '04.5'] , examples: '道路・住まい・まちづくり・バス' },
  { id: 'sangyo', name: '産業・しごと', cofog: ['04'] , examples: '商店街・中小企業・仕事さがしの支援' },
  { id: 'kankyo', name: '環境', cofog: ['05'] , examples: 'ごみ・リサイクル・省エネ' },
  { id: 'gyosei', name: '行政・お金の使い方', cofog: ['01', '02'] , examples: '窓口・議会・借金の返済' },
  { id: 'bunka', name: '文化・スポーツ', cofog: ['08'] , examples: '図書館・体育館・公園' },
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
