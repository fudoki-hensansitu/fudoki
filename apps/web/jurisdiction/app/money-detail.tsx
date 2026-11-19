// 予算・決算のタブの詳細の引き出し。入る→使うの分野、または「何に使う？」の節の区分を押すと開き、その中身（目・節）を額の多い順に出す。
// 広い画面は右から、狭い画面は下から出す
import * as React from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { XIcon } from '@phosphor-icons/react'
import { DOMAIN_FRAMES, OTHER_FRAME, frameOf } from '../domains'
import { setsuGroupOf, setsuLabelOf, unknownOf, UNKNOWN_SETSU, type SetsuGroup } from '../setsu-groups'
import type { Moku } from '../types'
import { Amt } from './amount'

/** field は入る→使うの分野、setsu は何に使う？の節の区分、setsuItem は表・サンキーで押した節（節マスタの ID） */
export type MoneyDetailKey = { kind: 'field'; id: string } | { kind: 'setsu'; id: string } | { kind: 'setsuItem'; id: string }

type Row = { key: string; name: string; sub?: string; yen: number }

/** 出す目の数。残りは件数と額にまとめる */
const LIMIT = 12

const pathOf = (m: Moku) => (m.path ?? []).filter((x): x is string => !!x).join('・')

function fieldRows(moku: Moku[], id: string): Row[] {
  const inField = (m: Moku) => (m.cofog ? frameOf(m.cofog)?.id ?? OTHER_FRAME.id : OTHER_FRAME.id) === id
  return moku.filter((m) => inField(m) && m.yen > 0).sort((a, b) => b.yen - a.yen).map((m) => ({ key: m.id, name: m.name, sub: pathOf(m), yen: m.yen }))
}

/** 区分の中の節ごとの額と、その区分にお金を多く出している目 */
function setsuRows(moku: Moku[], id: string): { setsu: Row[]; moku: Row[] } {
  const bySetsu = new Map<string, number>()
  const byMoku: Row[] = []
  for (const m of moku) {
    let yen = 0
    for (const s of m.setsu) {
      if (!s.setsuId || setsuGroupOf(s.setsuId) !== id) continue
      const label = setsuLabelOf(s.setsuId) ?? s.name
      bySetsu.set(label, (bySetsu.get(label) ?? 0) + s.yen)
      yen += s.yen
    }
    if (yen > 0) byMoku.push({ key: m.id, name: m.name, sub: pathOf(m), yen })
  }
  return {
    setsu: [...bySetsu].filter(([, yen]) => yen > 0).sort((a, b) => b[1] - a[1]).map(([name, yen]) => ({ key: name, name, yen })),
    moku: byMoku.sort((a, b) => b.yen - a.yen),
  }
}

/** 節の分からない分を持つ目（目の無い項も含む） */
function unknownRows(units: Moku[]): Row[] {
  return units.map((m) => ({ key: m.id, name: m.name, sub: pathOf(m), yen: unknownOf(m) })).filter((r) => r.yen > 0).sort((a, b) => b.yen - a.yen)
}

/** 一つの節（R1 以前の同じ名前の節も含む）にお金を出している目 */
function setsuItemRows(moku: Moku[], setsuId: string): Row[] {
  const label = setsuLabelOf(setsuId)
  const rows: Row[] = []
  for (const m of moku) {
    const yen = m.setsu.filter((s) => s.setsuId && setsuLabelOf(s.setsuId) === label).reduce((a, s) => a + s.yen, 0)
    if (yen > 0) rows.push({ key: m.id, name: m.name, sub: pathOf(m), yen })
  }
  return rows.sort((a, b) => b.yen - a.yen)
}

function Rows({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  const shown = rows.slice(0, LIMIT)
  const rest = rows.slice(LIMIT)
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <ul className="flex flex-col">
        {shown.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-border py-3 last:border-b-0">
            <span className="min-w-0">
              <span className="block text-base">{r.name}</span>
              {r.sub ? <span className="block text-xs text-muted-foreground">{r.sub}</span> : null}
            </span>
            <span className="text-right">
              <span className="block text-base tabular-nums">{((r.yen / total) * 100).toFixed(1)}<small className="text-xs text-muted-foreground">%</small></span>
              <Amt yen={r.yen} plainUnit className="block text-xs text-muted-foreground" />
            </span>
          </li>
        ))}
        {rest.length ? (
          <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3 text-sm text-muted-foreground">
            <span>ほか{rest.length}件</span>
            <Amt yen={rest.reduce((a, r) => a + r.yen, 0)} plainUnit className="text-right text-xs" />
          </li>
        ) : null}
      </ul>
    </section>
  )
}

export function MoneyDetail({ open, onClose, wide, moku, units, fields, groups, onProjects }: {
  /** 開いている詳細。閉じているときも閉じる動きのあいだは前の中身を出す */
  open: MoneyDetailKey | undefined
  onClose: () => void
  /** 広い画面か（右から出す）。狭い画面は下から */
  wide: boolean
  /** 開いている会計の目（節つき） */
  moku: Moku[]
  /** 目に、目の無い項・款を目の代わりに足したもの（節の分からない分に使う） */
  units: Moku[]
  /** 入る→使うの分野（金額の多い順） */
  fields: { id: string; name: string; yen: number }[]
  /** 何に使う？の節の区分 */
  groups: SetsuGroup[]
  /** 分野で絞った事業のタブへ移る */
  onProjects: (field: string) => void
}) {
  // 閉じる動きのあいだも中身を残す
  const [last, setLast] = React.useState(open)
  React.useEffect(() => {
    if (open) setLast(open)
  }, [open])
  const key = open ?? last
  const field = key?.kind === 'field' ? fields.find((f) => f.id === key.id) : undefined
  const group = key?.kind === 'setsu' ? groups.find((g) => g.id === key.id) : undefined
  const frame = field ? [...DOMAIN_FRAMES, OTHER_FRAME].find((f) => f.id === field.id) : undefined
  const body = React.useMemo(() => {
    if (!key) return undefined
    if (key.kind === 'field') return { kind: 'field' as const, rows: fieldRows(moku, key.id) }
    if (key.kind === 'setsuItem') return { kind: 'setsuItem' as const, rows: setsuItemRows(moku, key.id) }
    if (key.id === UNKNOWN_SETSU) return { kind: 'unknown' as const, rows: unknownRows(units) }
    return { kind: 'setsu' as const, ...setsuRows(moku, key.id) }
  }, [key, moku, units])
  // 押した節は、その会計の同じ節の和を見出しにする
  const item = key?.kind === 'setsuItem' && body?.kind === 'setsuItem' ? { name: setsuLabelOf(key.id) ?? '節', yen: body.rows.reduce((a, r) => a + r.yen, 0) } : undefined
  const head = field ?? group ?? item
  const desc = key?.kind === 'field'
    ? frame?.examples ? `${frame.examples}など。` : undefined
    : key?.kind === 'setsu' && key.id === UNKNOWN_SETSU ? '予算書・決算書の内訳が節で分かれていない科目の分です。' : undefined

  return (
    <Drawer open={!!open} onOpenChange={(o) => { if (!o) onClose() }} swipeDirection={wide ? 'right' : 'down'}>
      <DrawerContent className="data-[swipe-axis=x]:sm:[--drawer-content-width:28rem]">
        <DrawerHeader className="flex flex-row items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-4 text-left! md:text-left">
          <div className="min-w-0">
            <DrawerTitle className="text-base font-semibold">{head?.name}</DrawerTitle>
            {head ? <Amt yen={head.yen} className="mt-1 block text-base font-medium text-primary" /> : null}
            {/* 見て分かること（何を並べているか）は書かず、見ても分からないことだけを添える */}
            {desc ? <DrawerDescription className="mt-2 text-sm text-muted-foreground">{desc}</DrawerDescription> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="閉じる" onClick={onClose} className="-mt-1 -mr-2 shrink-0 rounded-full">
            <XIcon aria-hidden="true" />
          </Button>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
          {head && (body?.kind === 'field' || body?.kind === 'setsuItem' || body?.kind === 'unknown') ? <Rows title="科目（目）" rows={body.rows} total={head.yen} /> : null}
          {head && body?.kind === 'setsu' ? (
            <>
              <Rows title="節" rows={body.setsu} total={head.yen} />
              <Rows title="多く出している科目（目）" rows={body.moku} total={head.yen} />
            </>
          ) : null}
        </div>
        {field ? (
          <div className="border-t border-border px-5 py-4">
            <Button className="w-full rounded-full" onClick={() => onProjects(field.id)}>事業を見る</Button>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
