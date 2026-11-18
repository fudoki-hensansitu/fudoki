// お金の流れの表（shadcn の data table）。款 → 項 → 目 → 節を入れ子の行にし、行を押すと子を開け閉めする。データにある段まで（款だけのまちは款だけ）。
// 歳出と歳入は別の表で、それぞれ名前で探せる（探す語は呼ぶ側が URL に持つ）。探している間は、当てはまる行とその親だけを開いて出す。
// 金額は API が返した円をそのまま出し、割合はその歳出・歳入の総額に占める割合だけを画面で求める
import * as React from 'react'
import { CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import {
  columnFilteringFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  filterFn_includesString,
  rowExpandingFeature,
  tableFeatures,
  useTable,
  type ExpandedState,
} from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatShare, formatYen, type Drill } from './types'

const LEVELS = ['款', '項', '目', '節'] as const

interface Node {
  id: string
  name: string
  yen: number
  missing?: true
  depth: number
  subRows?: Node[]
}

const toNodes = (drills: Drill[]): Node[] =>
  drills.map((d) => ({
    id: d.kan.id, name: d.kan.name, yen: d.kan.yen, missing: d.kan.amountMissing, depth: 0,
    subRows: d.kou.length ? d.kou.map((k) => ({
      id: k.id, name: k.name, yen: k.yen, missing: k.amountMissing, depth: 1,
      subRows: k.moku.length ? k.moku.map((m) => ({
        id: m.id, name: m.name, yen: m.yen, missing: m.amountMissing, depth: 2,
        subRows: m.setsu.length ? m.setsu.map((s, i) => ({ id: `${m.id}:setsu:${i}`, name: s.name, yen: s.yen, missing: s.amountMissing, depth: 3 })) : undefined,
      })) : undefined,
    })) : undefined,
  }))

const features = tableFeatures({
  columnFilteringFeature,
  rowExpandingFeature,
  filteredRowModel: createFilteredRowModel(),
  expandedRowModel: createExpandedRowModel(),
  filterFns: { includesString: filterFn_includesString },
})
const column = createColumnHelper<typeof features, Node>()
const cls = (meta: unknown) => (meta as { className?: string } | undefined)?.className

function Section({ title, drills, total, query, onQuery }: { title: string; drills: Drill[]; total: number; query: string; onQuery: (q: string) => void }) {
  const data = React.useMemo(() => toNodes(drills), [drills])
  const depth = Math.max(0, ...drills.map((d) => (d.kou.some((k) => k.moku.some((m) => m.setsu.length > 0)) ? 3 : d.kou.some((k) => k.moku.length > 0) ? 2 : d.kou.length > 0 ? 1 : 0)))
  const levels = LEVELS.slice(0, depth + 1).join('・')
  // 開いた行は、探していないときと探しているときで分けて持つ。探し始めると当てはまる行の親をすべて開き、探し終えると前に開いていた行に戻す
  const [expanded, setExpanded] = React.useState<ExpandedState>({})
  const [found, setFound] = React.useState<ExpandedState>(true)
  const term = query.trim()
  React.useEffect(() => setFound(true), [term])
  const columns = React.useMemo(() => column.columns([
    column.accessor('name', {
      header: () => <>{title}<span className="ml-2">{levels.replaceAll('・', ' → ')}</span></>,
      filterFn: 'includesString',
      cell: (c) => {
        const row = c.row
        const open = row.getIsExpanded()
        return (
          <div className="flex items-center gap-1" style={{ paddingLeft: `${row.original.depth}rem` }}>
            {row.getCanExpand() ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); row.toggleExpanded() }} aria-expanded={open} aria-label={`${row.original.name}の${LEVELS[row.original.depth + 1]}を${open ? '閉じる' : '開く'}`} className="-my-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
                <CaretRightIcon aria-hidden="true" className={cn('size-4 transition-transform duration-200', open && 'rotate-90')} />
              </button>
            ) : depth > 0 ? (
              <span className="w-7 shrink-0" aria-hidden="true" />
            ) : null}
            <span className="min-w-0 leading-snug [overflow-wrap:anywhere]">
              <span className="mr-2 text-muted-foreground">{LEVELS[row.original.depth]}</span>
              {row.original.name}
            </span>
          </div>
        )
      },
      meta: { className: 'w-full pl-0 whitespace-normal' },
    }),
    column.accessor('yen', { header: '金額', cell: (c) => (c.row.original.missing ? '金額未記載' : formatYen(c.getValue())), meta: { className: 'text-right tabular-nums' } }),
    column.display({ id: 'share', header: '割合', cell: (c) => formatShare(c.row.original.yen, total, c.row.original.missing) ?? '', meta: { className: 'pr-0 text-right tabular-nums' } }),
  ]), [title, levels, depth, total])
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (n) => n.id,
    getSubRows: (n) => n.subRows,
    filterFromLeafRows: true,
    state: { columnFilters: term ? [{ id: 'name', value: term }] : [], expanded: term ? found : expanded },
    onExpandedChange: (u) => (term ? setFound : setExpanded)(u),
  })
  const rows = table.getRowModel().rows
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={`${title}の${levels}の名前で探す`} className="h-9 rounded-full pl-9" aria-label={`${title}を名前で探す`} />
      </div>
      <Table className="text-sm" aria-label={`${title}（${levels}）`}>
        <TableHeader>
          {table.getHeaderGroups().map((g) => (
            <TableRow key={g.id} className="hover:bg-transparent">
              {g.headers.map((h) => (
                <TableHead key={h.id} className={cn('h-9 font-normal text-muted-foreground', cls(h.column.columnDef.meta))}>
                  {h.isPlaceholder ? null : <table.FlexRender header={h} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {!rows.length ? (
            <TableRow className="hover:bg-transparent"><TableCell colSpan={columns.length} className="py-6 text-center">「{term}」に当てはまる{title}はありません</TableCell></TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.id} onClick={row.getCanExpand() ? () => row.toggleExpanded() : undefined} className={cn('text-foreground', row.getCanExpand() && 'cursor-pointer')}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn('py-2', cls(cell.column.columnDef.meta))}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

export type FlowQuery = { expenditure: string; revenue: string }

/** 歳出の表と、あれば一般会計の歳入の表。total は歳出の総額。探す語は歳出・歳入で別に持つ */
export function FlowTable({ flows, revenue, total, query, onQuery }: {
  flows: Drill[] | undefined
  revenue?: Drill[]
  total: number
  query: FlowQuery
  onQuery: (key: keyof FlowQuery, q: string) => void
}) {
  if (!flows) return <p role="status" className="py-6 text-sm text-muted-foreground">読み込んでいます</p>
  const revenueTotal = (revenue ?? []).reduce((s, d) => s + (d.kan.amountMissing ? 0 : d.kan.yen), 0)
  return (
    <div className="flex flex-col gap-8">
      <Section title="歳出" drills={flows} total={total} query={query.expenditure} onQuery={(q) => onQuery('expenditure', q)} />
      {revenue?.length ? <Section title="歳入" drills={revenue} total={revenueTotal} query={query.revenue} onQuery={(q) => onQuery('revenue', q)} /> : null}
    </div>
  )
}
