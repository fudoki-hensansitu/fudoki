// 分野（COFOG の大分類）→ 中分類 → 目 の流れを、目の並びから組む。サーバー（server/jurisdiction.ts の loadCofogFlow）と画面（予算・決算のタブの分野の図）が同じものを使う
import { COFOG_GROUPS } from '@fudoki/fiscal/cofog-master'
import { frameOf, OTHER_FRAME } from './domains'
import type { Drill, Moku } from './types'

const sumYen = (lines: { yen: number; amountMissing?: true }[]) => lines.reduce((s, l) => s + (l.amountMissing ? 0 : l.yen), 0)
/** 金額の印字が無い目を含む和は、印字された分だけの和であることを amountMissing で画面に伝える（一覧の総額と同じ扱い） */
const partial = (lines: { amountMissing?: true }[]) => (lines.some((l) => l.amountMissing) ? { amountMissing: true as const } : {})
const byYen = (a: { yen: number }, b: { yen: number }) => b.yen - a.yen

/** 中分類の名前。大分類までしか決めていない目・コードの無い目はそう書く */
function cofogGroupName(group: string) {
  if (!group) return '分類を決められない支出'
  if (!group.includes('.')) return '未分類'
  // 名前の表は規則が使うコードを全部持つ（cofog-master.ts）。漏れたときもページは落とさずコードを出す
  return COFOG_GROUPS[group] ?? `COFOG ${group}`
}

/**
 * 款・項は使わず、目に付いた COFOG のコードで大分類・中分類を決める。金額は目の和（api の sum_rules: COFOG は目を前方一致で集めて足す。
 * 分類できない目・対象外の目は「その他」に入れ、全分類の和が総額になる。印字の無い目を含む分類は amountMissing を付ける）。
 * 並びは金額の順で「その他」を最後に置く。中分類も、未分類（中分類まで決めていない目）は金額に関係なく最後に置く。withMoku が false なら目を返さない（全体図だけに使う）
 */
export function cofogFlowOf(moku: Moku[], withMoku = true): Drill[] {
  const divisions = new Map<string, Map<string, Moku[]>>()
  for (const m of moku) {
    const [division = '', group] = m.cofog?.split('.') ?? []
    const key = group ? `${division}.${group}` : division
    const byGroup = divisions.get(division) ?? new Map<string, Moku[]>()
    byGroup.set(key, [...(byGroup.get(key) ?? []), m])
    divisions.set(division, byGroup)
  }
  return [...divisions].map(([division, byGroup]) => {
    const kou = [...byGroup].map(([group, list]) => {
      const lines = [...list].sort(byYen)
      return { id: `cofog-${group || 'none'}-g`, name: cofogGroupName(group), yen: sumYen(lines), ...partial(lines), moku: withMoku ? lines : [] }
    }).sort((a, b) => Number(!a.id.includes('.')) - Number(!b.id.includes('.')) || b.yen - a.yen)
    const kan = { id: `cofog-${division || 'none'}`, name: (division ? frameOf(division) : OTHER_FRAME)?.name ?? `COFOG ${division}`, yen: kou.reduce((sum, k) => sum + k.yen, 0), ...partial(kou) }
    return { kan, kou }
  }).sort((a, b) => Number(a.kan.id === 'cofog-none') - Number(b.kan.id === 'cofog-none') || b.kan.yen - a.kan.yen)
}

/** 款 → 項 → 目 の流れの目と、木に入らない（項の行が無い）目を、分野の流れに組み直す */
export const cofogFlowOfDrills = (drills: Drill[], loose: Moku[] = []) => cofogFlowOf([...drills.flatMap((d) => d.kou.flatMap((k) => k.moku)), ...loose])
