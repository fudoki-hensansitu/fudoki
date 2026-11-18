// お金の流れの表。款 → 項 → 目 → 節を入れ子の行にし、行の頭のボタンで子を開け閉めする。データにある段まで（款だけのまちは款だけ）。
// 金額は API が返した円をそのまま出し、割合はその歳出・歳入の総額に占める割合だけを画面で求める
import * as React from 'react'
import { CaretRightIcon } from '@phosphor-icons/react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatShare, formatYen, type Drill, type Kou, type Moku, type Setsu } from './types'

const LEVELS = ['款', '項', '目', '節'] as const

interface Row {
  key: string
  name: string
  yen: number
  missing?: true
  depth: number
  children: () => Row[]
  hasChildren: boolean
}

const setsuRow = (moku: Moku, s: Setsu, i: number): Row => ({ key: `${moku.id}:setsu:${i}`, name: s.name, yen: s.yen, missing: s.amountMissing, depth: 3, children: () => [], hasChildren: false })
const mokuRow = (m: Moku): Row => ({ key: m.id, name: m.name, yen: m.yen, missing: m.amountMissing, depth: 2, children: () => m.setsu.map((s, i) => setsuRow(m, s, i)), hasChildren: m.setsu.length > 0 })
const kouRow = (k: Kou): Row => ({ key: k.id, name: k.name, yen: k.yen, missing: k.amountMissing, depth: 1, children: () => k.moku.map(mokuRow), hasChildren: k.moku.length > 0 })
const kanRow = (d: Drill): Row => ({ key: d.kan.id, name: d.kan.name, yen: d.kan.yen, missing: d.kan.amountMissing, depth: 0, children: () => d.kou.map(kouRow), hasChildren: d.kou.length > 0 })

/** 開いた行だけを並べる。閉じた行の子は描かない（大きいまちの決算で行が数千になるため） */
function visible(rows: Row[], open: ReadonlySet<string>): Row[] {
  return rows.flatMap((r) => (r.hasChildren && open.has(r.key) ? [r, ...visible(r.children(), open)] : [r]))
}

function Section({ title, drills, total }: { title: string; drills: Drill[]; total: number }) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set())
  const roots = React.useMemo(() => drills.map(kanRow), [drills])
  const rows = visible(roots, open)
  const toggle = (key: string) => setOpen((s) => {
    const next = new Set(s)
    if (!next.delete(key)) next.add(key)
    return next
  })
  const depth = Math.max(0, ...drills.map((d) => (d.kou.some((k) => k.moku.some((m) => m.setsu.length > 0)) ? 3 : d.kou.some((k) => k.moku.length > 0) ? 2 : d.kou.length > 0 ? 1 : 0)))
  return (
    <section aria-label={title}>
      <Table aria-label={`${title}（${LEVELS.slice(0, depth + 1).join('・')}）`}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-full pl-0 text-muted-foreground">{title}<span className="ml-2 text-xs font-normal">{LEVELS.slice(0, depth + 1).join(' → ')}</span></TableHead>
            <TableHead className="text-right text-muted-foreground">金額</TableHead>
            <TableHead className="pr-0 text-right text-muted-foreground">割合</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const expanded = r.hasChildren && open.has(r.key)
            return (
              <TableRow key={r.key} className={cn(r.depth > 0 && 'text-sm', r.depth === 3 && 'text-muted-foreground')}>
                <TableCell className="py-2 pl-0 whitespace-normal">
                  <div className="flex items-center gap-1" style={{ paddingLeft: `${r.depth * 1.25}rem` }}>
                    {r.hasChildren ? (
                      <button type="button" onClick={() => toggle(r.key)} aria-expanded={expanded} aria-label={`${r.name}の${LEVELS[r.depth + 1]}を${expanded ? '閉じる' : '開く'}`} className="-my-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                        <CaretRightIcon aria-hidden="true" className={cn('size-4 transition-transform duration-200', expanded && 'rotate-90')} />
                      </button>
                    ) : (
                      <span className="size-7 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 leading-snug [overflow-wrap:anywhere]">
                      <span className="mr-2 text-xs text-muted-foreground">{LEVELS[r.depth]}</span>
                      {r.hasChildren ? <button type="button" onClick={() => toggle(r.key)} tabIndex={-1} className="text-left hover:underline">{r.name}</button> : r.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cn('py-2 text-right align-top tabular-nums', r.depth === 0 && 'font-semibold text-primary')}>{r.missing ? <span className="text-xs text-muted-foreground">金額未記載</span> : formatYen(r.yen)}</TableCell>
                <TableCell className="py-2 pr-0 text-right align-top text-xs tabular-nums text-muted-foreground">{formatShare(r.yen, total, r.missing) ?? ''}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}

/** revenue（一般会計の歳入）があれば上に、歳出を下に置く。total は歳出の総額 */
export function FlowTable({ flows, revenue, total }: { flows: Drill[] | undefined; revenue?: Drill[]; total: number }) {
  if (!flows) return <p role="status" className="py-6 text-sm text-muted-foreground">読み込んでいます</p>
  const revenueTotal = (revenue ?? []).reduce((s, d) => s + (d.kan.amountMissing ? 0 : d.kan.yen), 0)
  return (
    <div className="flex flex-col gap-8">
      <Section title="歳出" drills={flows} total={total} />
      {revenue?.length ? <Section title="歳入" drills={revenue} total={revenueTotal} /> : null}
    </div>
  )
}
