// 歳出の節（法定の28区分）を、お金の出し方でいくつかにまとめる。予算・決算のタブの「何に使う？」に使う
import { expenditureSetsuMaster } from '@fudoki/fiscal/setsu-master'
import type { Moku } from './types'

export interface SetsuGroup {
  id: string
  name: string
  yen: number
}

/** まとめた区分と、そこへ入れる節の名前（節マスタの名前）。R1 以前の賃金は人件費。並びは同じ額のときの順 */
const GROUPS: { id: string; name: string; labels: string[] }[] = [
  { id: 'people', name: '人件費', labels: ['報酬', '給料', '職員手当等', '共済費', '災害補償費', '恩給及び退職年金', '賃金'] },
  { id: 'grants', name: '補助・負担金', labels: ['負担金、補助及び交付金'] },
  { id: 'outsourcing', name: '委託料', labels: ['委託料'] },
  { id: 'welfare', name: '扶助費', labels: ['扶助費'] },
  { id: 'construction', name: '工事', labels: ['工事請負費'] },
  { id: 'goods', name: '物・サービスの購入', labels: ['報償費', '旅費', '交際費', '需用費', '役務費', '使用料及び賃借料', '原材料費', '公有財産購入費', '備品購入費'] },
  { id: 'transfer', name: 'ほかの会計への繰出し', labels: ['繰出金'] },
  { id: 'debt', name: '借金の返済', labels: ['償還金、利子及び割引料'] },
  { id: 'other', name: '積立・貸付など', labels: ['貸付金', '補償、補塡及び賠償金', '投資及び出資金', '積立金', '寄附金', '公課費', '予備費'] },
]
const GROUP_OF_LABEL = new Map(GROUPS.flatMap((g) => g.labels.map((l) => [l, g.id] as const)))
/** 節マスタの ID（setsu-12・setsu-13-2019）から節の名前 */
const LABEL_OF = new Map(expenditureSetsuMaster().map((s) => [s.expenditure_setsu_id, s.label] as const))

/** 節マスタの ID の名前（R1 以前の賃金は「賃金」） */
export function setsuLabelOf(setsuId: string): string | undefined {
  return LABEL_OF.get(setsuId)
}

/** 節マスタの ID からまとめた区分 */
export function setsuGroupOf(setsuId: string): string | undefined {
  const label = LABEL_OF.get(setsuId)
  return label ? GROUP_OF_LABEL.get(label) : undefined
}

export const UNKNOWN_SETSU = 'unknown'

/** 目のうち節の分からない額（目の額から区分の分かる節を引いた残り、負にはしない）。「節の分からない分」の見出しと詳細の行で同じ式を使う */
export function unknownOf(m: Moku): number {
  const known = m.setsu.reduce((a, s) => a + (s.setsuId && setsuGroupOf(s.setsuId) ? s.yen : 0), 0)
  return Math.max(0, m.yen - known)
}

/** 目の節を区分ごとに足す。節の分からない分（内訳が節でない目・節の無い目・目の無い項）は目ごとの残りを足して最後に置く。多い順 */
export function setsuGroups(moku: Moku[]): { groups: SetsuGroup[]; known: number; total: number } {
  const sums = new Map<string, number>()
  let unknown = 0
  for (const m of moku) {
    for (const s of m.setsu) {
      const g = s.setsuId ? setsuGroupOf(s.setsuId) : undefined
      if (g) sums.set(g, (sums.get(g) ?? 0) + s.yen)
    }
    unknown += unknownOf(m)
  }
  const known = [...sums.values()].reduce((a, b) => a + b, 0)
  const groups = GROUPS.map((g) => ({ id: g.id, name: g.name, yen: sums.get(g.id) ?? 0 }))
    .filter((g) => g.yen > 0)
    .sort((a, b) => b.yen - a.yen)
  if (unknown > 0) groups.push({ id: UNKNOWN_SETSU, name: '節の分からない分', yen: unknown })
  return { groups, known, total: known + unknown }
}
