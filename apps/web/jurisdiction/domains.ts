// 自治体ページの分野。どの自治体でも同じ分け方で出すため、手で枠を決めず COFOG（政府支出の機能別分類）の大分類（10分類）をそのまま使う。
// 事業に COFOG を付ければ分野が一つに決まる。お金の流れ（機能分類）・区は何をしている？・暮らしで何が変わった？で同じ分野を使う。
// 名前は大分類を区政を知らない人に伝わる言い方にしたもの（正式名は cofog-master.ts）。並びは市民の関心の高い順
// （区市の世論調査で「力を入れてほしい施策」の上位に来る防災・子育て・高齢者福祉を先に置く）。名前・並びは風土記の判断
export interface DomainFrame {
  id: string
  name: string
  /** COFOG の大分類のコード */
  cofog: string
  /** 区政を知らない人向けの、この分野に入る自治体の仕事の例。COFOG の振り分け規則（cofog_rules）と食い違わないものだけ。自治体が受け持たない分野（防衛）は空 */
  examples: string
}

export const DOMAIN_FRAMES: DomainFrame[] = [
  { id: 'bosai', name: '防災・安全', cofog: '03', examples: '消防・防犯・交通安全' },
  { id: 'fukushi', name: '福祉・子育て', cofog: '10', examples: '保育園・学童・介護・障害のある人の支援・生活保護' },
  { id: 'kyoiku', name: '教育', cofog: '09', examples: '小中学校・給食・幼稚園' },
  { id: 'iryo', name: '健康・医療', cofog: '07', examples: '健診・予防接種・保健所' },
  { id: 'kurashi', name: '住まい・まちづくり', cofog: '06', examples: '住まい・再開発・まちの整備' },
  { id: 'sangyo', name: '産業・交通', cofog: '04', examples: '商店街・中小企業・仕事さがし・道路・バス' },
  { id: 'kankyo', name: '環境', cofog: '05', examples: 'ごみ・リサイクル・省エネ' },
  { id: 'bunka', name: '文化・スポーツ', cofog: '08', examples: '図書館・体育館・公園' },
  { id: 'gyosei', name: '行政・議会', cofog: '01', examples: '窓口・税・議会・借金の返済' },
  { id: 'boei', name: '防衛', cofog: '02', examples: '' },
]

/** COFOG のコードが付かない目（分類できない・分類の対象外）の入る分野。お金の流れで全分野の和を総額に合わせるために使う */
export const OTHER_FRAME: DomainFrame = { id: 'other', name: 'その他', cofog: '', examples: '分野を一つに決められない支出' }

const covers = (prefix: string, code: string) => code === prefix || code.startsWith(`${prefix}.`)

/** COFOG コードが入る分野（大分類） */
export function frameOf(cofog: string): DomainFrame | undefined {
  return DOMAIN_FRAMES.find((f) => covers(f.cofog, cofog))
}

/** 事業を枠ごとに並べる。事業の無い枠は出さない。並びは DOMAIN_FRAMES の順、枠の中は元の順 */
export function groupByFrame<T extends { cofog: string }>(items: T[]): { frame: DomainFrame; items: T[] }[] {
  return DOMAIN_FRAMES.map((frame) => ({ frame, items: items.filter((p) => frameOf(p.cofog) === frame) })).filter((g) => g.items.length)
}
