// 歳出の節（法定の28区分）を、お金の出し方でいくつかにまとめる。予算・決算のタブの「どうやって使う？」に使う
import type { Moku } from './types'

export interface SetsuGroup {
  id: string
  name: string
  yen: number
}

/** まとめた区分と、そこへ入れる節の番号（R2 からの番号）。並びは同じ額のときの順 */
const GROUPS: { id: string; name: string; codes: number[] }[] = [
  { id: 'people', name: '人件費', codes: [1, 2, 3, 4, 5, 6] },
  { id: 'grants', name: '補助・負担金', codes: [18] },
  { id: 'outsourcing', name: '委託料', codes: [12] },
  { id: 'welfare', name: '扶助費', codes: [19] },
  { id: 'construction', name: '工事', codes: [14] },
  { id: 'goods', name: '物・サービスの購入', codes: [7, 8, 9, 10, 11, 13, 15, 16, 17] },
  { id: 'transfer', name: 'ほかの会計への繰出し', codes: [27] },
  { id: 'debt', name: '借金の返済', codes: [22] },
  { id: 'other', name: '積立・貸付など', codes: [20, 21, 23, 24, 25, 26, 28] },
]
const GROUP_OF = new Map(GROUPS.flatMap((g) => g.codes.map((c) => [c, g.id] as const)))

/** 節マスタの ID（setsu-12・setsu-13-2019）からまとめた区分。R1 以前は 07 が賃金（人件費）で、08 から後ろが1つずつずれる */
export function setsuGroupOf(setsuId: string): string | undefined {
  const m = /^setsu-(\d{2})(-2019)?$/.exec(setsuId)
  if (!m) return undefined
  const code = Number(m[1])
  if (!m[2]) return GROUP_OF.get(code)
  return code === 7 ? 'people' : GROUP_OF.get(code >= 8 ? code - 1 : code)
}

/** 節の名前（R2 からの番号）。R1 以前の節は setsuCode で R2 の番号に寄せてから引く（07 の賃金だけは R2 に無い） */
const SETSU_LABELS = ['', '報酬', '給料', '職員手当等', '共済費', '災害補償費', '恩給及び退職年金', '報償費', '旅費', '交際費', '需用費', '役務費', '委託料', '使用料及び賃借料', '工事請負費', '原材料費', '公有財産購入費', '備品購入費', '負担金、補助及び交付金', '扶助費', '貸付金', '補償、補塡及び賠償金', '償還金、利子及び割引料', '投資及び出資金', '積立金', '寄附金', '公課費', '繰出金', '予備費']

/** 節マスタの ID の名前（R1 以前の賃金は「賃金」） */
export function setsuLabelOf(setsuId: string): string | undefined {
  const m = /^setsu-(\d{2})(-2019)?$/.exec(setsuId)
  if (!m) return undefined
  const code = Number(m[1])
  if (!m[2]) return SETSU_LABELS[code]
  return code === 7 ? '賃金' : SETSU_LABELS[code >= 8 ? code - 1 : code]
}

export const UNKNOWN_SETSU = 'unknown'

/** 目の節を区分ごとに足す。節の分からない分（内訳が節でない目・節の無い目）は total との差で「節の分からない分」にする。多い順、分からない分は最後 */
export function setsuGroups(moku: Moku[], total: number): { groups: SetsuGroup[]; known: number } {
  const sums = new Map<string, number>()
  for (const m of moku) {
    for (const s of m.setsu) {
      const g = s.setsuId ? setsuGroupOf(s.setsuId) : undefined
      if (g) sums.set(g, (sums.get(g) ?? 0) + s.yen)
    }
  }
  const known = [...sums.values()].reduce((a, b) => a + b, 0)
  const groups = GROUPS.map((g) => ({ id: g.id, name: g.name, yen: sums.get(g.id) ?? 0 }))
    .filter((g) => g.yen > 0)
    .sort((a, b) => b.yen - a.yen)
  const unknown = total - known
  // 端数のずれ（総額の0.5%未満）は出さない
  if (unknown > total * 0.005) groups.push({ id: UNKNOWN_SETSU, name: '節の分からない分', yen: unknown })
  return { groups, known }
}
