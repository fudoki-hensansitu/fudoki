// 自治体ページの分野。どの自治体でも同じ分け方で出すため、手で枠を決めず COFOG（政府支出の機能別分類）の大分類（10分類）をそのまま使う。
// 事業に COFOG を付ければ分野が一つに決まる。お金の流れ（機能分類）・区は何をしている？・暮らしで何が変わった？で同じ分野を使う。
// 名前は packages/fiscal/cofog-master.ts の COFOG_DIVISION_LABELS（大分類の言い換え）が正本で、ここは並びと仕事の例だけを持つ。並びは市民の関心の高い順
// （区市の世論調査で「力を入れてほしい施策」の上位に来る防災・子育て・高齢者福祉を先に置く）。並びは風土記の判断
import { COFOG_DIVISION_LABELS } from '@fudoki/fiscal/cofog-master'

export interface DomainFrame {
  id: string
  name: string
  /** COFOG の大分類のコード */
  cofog: string
  /** 区政を知らない人向けの、この分野に入る自治体の仕事の例。COFOG の振り分け規則（cofog_rules）と食い違わないものだけ。自治体が受け持たない分野（防衛）は空 */
  examples: string
}

// [id, COFOG の大分類, 仕事の例]
const FRAMES: [id: string, cofog: string, examples: string][] = [
  ['bosai', '03', '消防・防犯・交通安全'],
  ['fukushi', '10', '保育園・学童・介護・障害のある人の支援・生活保護'],
  ['kyoiku', '09', '小中学校・給食・幼稚園'],
  ['iryo', '07', '健診・予防接種・保健所'],
  ['kurashi', '06', '住まい・再開発・まちの整備'],
  ['sangyo', '04', '商店街・中小企業・仕事さがし・道路・バス'],
  ['kankyo', '05', 'ごみ・リサイクル・省エネ'],
  ['bunka', '08', '図書館・体育館・公園'],
  ['gyosei', '01', '窓口・税・議会・借金の返済'],
  ['boei', '02', ''],
]

export const DOMAIN_FRAMES: DomainFrame[] = FRAMES.map(([id, cofog, examples]) => ({ id, name: COFOG_DIVISION_LABELS[cofog]!, cofog, examples }))

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
