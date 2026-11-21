// お金の流れの表（shadcn の data table）。款 → 項 → 目 → 節を入れ子の行にし、行を押すと子を開け閉めする。データにある段まで（款だけのまちは款だけ）。
// 歳出と歳入は別の表で、それぞれ名前で探せる（探す語は呼ぶ側が URL に持つ）。探している間は、当てはまる行とその親だけを開いて出す。
// 金額は API が返した円をそのまま出し、割合はその歳出・歳入の総額に占める割合だけを画面で求める
// 金額の見出しを押すと、同じ親の中で金額の多い順→少ない順→出典の順に並べ替える。金額未記載の行はいつも後ろに置く
import * as React from 'react'
import { ArrowDownIcon, ArrowSquareOutIcon, ArrowUpIcon, ArrowsDownUpIcon, CaretRightIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import {
  columnFilteringFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowExpandingFeature,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ExpandedState,
  type SortingState,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Title } from '@/components/ui/title'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatShare, formatYen, type Drill } from './types'

const LEVELS = ['款', '項', '目', '節'] as const
/** 行の頭の印。目の下の事業は、節と同じ目の額の別の切り口なので、節と足さないよう額を出さない「事業」の行の下にまとめる（事業の行には印を付けない） */
const labelOf = (n: Node) => (n.group || n.depth > 3 ? '' : n.project ? '事業' : LEVELS[n.depth])
const childLabelOf = (n: Node) => (n.group ? '事業' : LEVELS[n.depth + 1])

interface Node {
  id: string
  name: string
  yen: number
  missing?: true
  depth: number
  /** 事業の行（目の下の「事業」の行の子） */
  project?: true
  /** 目の下で事業の行をまとめる行。額は節と同じ目の額なので出さない */
  group?: true
  /** 名前が印字された出典の URL（PDF は頁つき） */
  src?: string
  /** 歳出の節の節マスタの ID。あれば行を押すと節の詳細を開く */
  setsuId?: string
  /** 事業の行の内訳の ID。事業の ID は行を出したときに読む */
  detailId?: string
  subRows?: Node[]
}

const toNodes = (drills: Drill[]): Node[] =>
  drills.map((d) => ({
    id: d.kan.id, name: d.kan.name, yen: d.kan.yen, missing: d.kan.amountMissing, depth: 0, src: d.kan.src,
    subRows: d.kou.length ? d.kou.map((k) => ({
      id: k.id, name: k.name, yen: k.yen, missing: k.amountMissing, depth: 1, src: k.src,
      subRows: k.moku.length ? k.moku.map((m) => ({
        id: m.id, name: m.name, yen: m.yen, missing: m.amountMissing, depth: 2, src: m.src,
        subRows: m.setsu.length || m.projects?.length ? [
          ...m.setsu.map((s, k): Node => ({ id: `${m.id}:setsu:${k}`, name: s.name, yen: s.yen, missing: s.amountMissing, depth: 3, src: s.src, setsuId: s.setsuId, ...(s.detailId ? { project: true as const, detailId: s.detailId } : {}) })),
          ...(m.projects?.length ? [{
            id: `${m.id}:projects`, name: '事業', yen: 0, depth: 3, group: true as const,
            subRows: m.projects.map((s, j): Node => ({ id: `${m.id}:project:${j}`, name: s.name, yen: s.yen, missing: s.amountMissing, depth: 4, project: true as const, src: s.src, detailId: s.detailId })),
          }] : []),
        ] : undefined,
      })) : undefined,
    })) : undefined,
  }))

const features = tableFeatures({
  columnFilteringFeature,
  rowExpandingFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { basic: sortFn_basic },
})
const column = createColumnHelper<typeof features, Node>()
const cls = (meta: unknown) => (meta as { className?: string } | undefined)?.className

type ProjectLink = { href: (id: string) => string; open: (id: string) => void; /** 事業の行（内訳の ID）から事業の ID を読む */ load: (detailIds: string[]) => Promise<Record<string, string>> }

function Section({ title, drills, total, query, onQuery, onSetsu, project }: { title: string; drills: Drill[]; total: number; query: string; onQuery: (q: string) => void; /** 節の行を押したとき（節の詳細を開く） */ onSetsu?: (setsuId: string) => void; /** 事業の行を押したとき（事業の頁へ移る） */ project?: ProjectLink }) {
  const data = React.useMemo(() => toNodes(drills), [drills])
  // 出典の分かる行が1つでもあれば、割合の右に出典の列を出す
  const hasSrc = React.useMemo(() => drills.some((d) => d.kan.src || d.kou.some((k) => k.src || k.moku.some((m) => m.src))), [drills])
  const depth = Math.max(0, ...drills.map((d) => (d.kou.some((k) => k.moku.some((m) => m.setsu.length > 0 || !!m.projects?.length)) ? 3 : d.kou.some((k) => k.moku.length > 0) ? 2 : d.kou.length > 0 ? 1 : 0)))
  // 目の下に事業の行もあれば、段の名前に足す（款・項・目・節・事業）
  const hasProjects = drills.some((d) => d.kou.some((k) => k.moku.some((m) => m.projects?.length)))
  const levels = [...LEVELS.slice(0, depth + 1), ...(hasProjects ? ['事業'] : [])].join('・')
  // 開いた行は、探していないときと探しているときで分けて持つ。探し始めると当てはまる行の親をすべて開き、探し終えると前に開いていた行に戻す
  const [expanded, setExpanded] = React.useState<ExpandedState>({})
  const [found, setFound] = React.useState<ExpandedState>(true)
  // 打つたびに絞り直さず、打ち終えて少し待ってから絞る。URL から来た語はすぐ使う
  const [term, setTerm] = React.useState(() => query.trim())
  // 絞ると行が減って下の要素が上がるので、絞り始める前の表の高さ（画面の高さまで）を保つ
  const wrap = React.useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = React.useState<number>()
  React.useEffect(() => {
    const next = query.trim()
    if (next === term) return
    const t = setTimeout(() => {
      if (!term && next && wrap.current) setMinHeight(Math.min(wrap.current.offsetHeight, window.innerHeight))
      if (!next) setMinHeight(undefined)
      setTerm(next)
    }, 250)
    return () => clearTimeout(t)
  }, [query, term])
  React.useEffect(() => setFound(true), [term])
  const [sorting, setSorting] = React.useState<SortingState>([])
  // 事業の ID は、開いた・探して出た事業の行の分だけ読む。読めなかった行はリンクにしない（名前だけ出す）
  const [links, setLinks] = React.useState<Record<string, string>>({})
  const asked = React.useRef(new Set<string>())
  const projectIdOf = React.useCallback((n: Node) => (n.detailId ? links[n.detailId] : undefined), [links])
  const columns = React.useMemo(() => column.columns([
    column.accessor('name', {
      // 事業は節の下ではない（目の別の分け方）ので、矢印でなく「・」でつなぐ
      header: () => LEVELS.slice(0, depth + 1).join(' → ') + (hasProjects ? '・事業' : ''),
      filterFn: 'includesString',
      cell: (c) => {
        const row = c.row
        const open = row.getIsExpanded()
        const projectId = projectIdOf(row.original)
        return (
          <div className="flex items-center gap-1" style={{ paddingLeft: `${row.original.depth}rem` }}>
            {row.getCanExpand() ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); row.toggleExpanded() }} aria-expanded={open} aria-label={`${row.original.name}の${childLabelOf(row.original)}を${open ? '閉じる' : '開く'}`} className="-my-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
                <CaretRightIcon aria-hidden="true" className={cn('size-4 transition-transform duration-200', open && 'rotate-90')} />
              </button>
            ) : depth > 0 ? (
              <span className="w-7 shrink-0" aria-hidden="true" />
            ) : null}
            <span className={cn('min-w-0 leading-snug [overflow-wrap:anywhere]', row.original.group && 'text-muted-foreground')}>
              {labelOf(row.original) ? <span className="mr-2 text-muted-foreground">{labelOf(row.original)}</span> : null}
              {/* 押すと詳細を開く節は、キーボードでも開けるようボタンにする */}
              {/* 事業は事業の頁へのリンク。新しいタブでも開けるよう href を持ち、ふつうに押したときは頁の中で移る */}
              {project && projectId ? (
                <a href={project.href(projectId)} onClick={(e) => { e.stopPropagation(); if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); project.open(projectId) }} className="rounded-sm text-foreground underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">{row.original.name}</a>
              ) : onSetsu && row.original.setsuId && !row.getCanExpand() ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); onSetsu(row.original.setsuId!) }} className="rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring">{row.original.name}</button>
              ) : row.original.name}
            </span>
          </div>
        )
      },
      enableSorting: false,
      meta: { className: 'w-full pl-0 whitespace-normal' },
    }),
    column.accessor((n) => (n.missing || n.group ? undefined : n.yen), {
      id: 'yen',
      header: (h) => {
        const sorted = h.column.getIsSorted()
        const Icon = sorted === 'desc' ? ArrowDownIcon : sorted === 'asc' ? ArrowUpIcon : ArrowsDownUpIcon
        return (
          <button type="button" onClick={h.column.getToggleSortingHandler()} className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring">
            金額<Icon aria-hidden="true" className="size-3.5" />
          </button>
        )
      },
      cell: (c) => (c.row.original.group ? '' : c.row.original.missing ? '金額未記載' : formatYen(c.row.original.yen)),
      sortFn: 'basic',
      sortDescFirst: true,
      sortUndefined: 'last',
      meta: { className: 'text-right tabular-nums' },
    }),
    column.display({ id: 'share', header: '割合', cell: (c) => (c.row.original.group ? '' : formatShare(c.row.original.yen, total, c.row.original.missing) ?? ''), meta: { className: cn('text-right tabular-nums', !hasSrc && 'pr-0') } }),
    ...(hasSrc ? [column.display({
      id: 'src',
      header: () => <span className="sr-only">出典</span>,
      // 出典の頁を新しいタブで開く。行を押すと開け閉めするので、リンクを押したときは行に伝えない
      cell: (c) => c.row.original.src ? (
        <a href={c.row.original.src} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`${c.row.original.name}の出典を開く`} className="-my-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs whitespace-nowrap text-muted-foreground no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {/* 狭い画面は名前の幅を空けるため、印だけにする */}
          <span className="hidden sm:inline">出典</span><ArrowSquareOutIcon aria-hidden="true" className="size-4 sm:size-3.5" />
        </a>
      ) : null,
      meta: { className: 'w-0 pr-0 text-right' },
    })] : []),
  ]), [title, levels, depth, total, hasSrc, hasProjects, onSetsu, project, projectIdOf])
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (n) => n.id,
    getSubRows: (n) => n.subRows,
    filterFromLeafRows: true,
    state: { columnFilters: term ? [{ id: 'name', value: term }] : [], expanded: term ? found : expanded, sorting },
    onExpandedChange: (u) => (term ? setFound : setExpanded)(u),
    onSortingChange: setSorting,
  })
  const rows = table.getRowModel().rows
  const missing = project ? rows.flatMap((r) => (r.original.detailId && !asked.current.has(r.original.detailId) ? [r.original.detailId] : [])) : []
  const missingKey = missing.join(',')
  React.useEffect(() => {
    if (!project || !missing.length) return
    for (const id of missing) asked.current.add(id)
    for (let i = 0; i < missing.length; i += 100) {
      const ids = missing.slice(i, i + 100)
      // 読めなかった ID は読んだ印を外し、次に行を出し直したときに読み直す
      void project.load(ids).then((x) => setLinks((l) => ({ ...l, ...x })), () => { for (const id of ids) asked.current.delete(id) })
    }
  }, [missingKey])
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <Title id={headingId} size="headline" as="h3">{title}</Title>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={`${title}の${levels}の名前で探す`} className="h-9 rounded-full pl-9" aria-label={`${title}を名前で探す`} />
      </div>
      <div ref={wrap} style={term ? { minHeight } : undefined}>
      <Table aria-label={`${title}（${levels}）`}>
        <TableHeader>
          {table.getHeaderGroups().map((g) => (
            <TableRow key={g.id} className="hover:bg-transparent">
              {g.headers.map((h) => (
                <TableHead key={h.id} aria-sort={!h.column.getCanSort() ? undefined : h.column.getIsSorted() === 'desc' ? 'descending' : h.column.getIsSorted() === 'asc' ? 'ascending' : 'none'} className={cn('h-9 font-normal text-muted-foreground', cls(h.column.columnDef.meta))}>
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
          {rows.map((row) => {
            const projectId = projectIdOf(row.original)
            return (
            <TableRow key={row.id} onClick={row.getCanExpand() ? () => row.toggleExpanded() : project && projectId ? () => project.open(projectId) : onSetsu && row.original.setsuId ? () => onSetsu(row.original.setsuId!) : undefined} className={cn('text-foreground', (row.getCanExpand() || (project && projectId) || (onSetsu && row.original.setsuId)) && 'cursor-pointer')}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn('py-2', cls(cell.column.columnDef.meta))}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </section>
  )
}

export type FlowQuery = { expenditure: string; revenue: string }

/** 歳出の表と、あれば一般会計の歳入の表。total は歳出の総額。探す語は歳出・歳入で別に持つ */
export function FlowTable({ flows, revenue, total, query, onQuery, onRetry, onSetsu, project }: {
  flows: Drill[] | undefined
  revenue?: Drill[]
  total: number
  query: FlowQuery
  onQuery: (key: keyof FlowQuery, q: string) => void
  /** 読めなかったときに読み直す。あれば「読めませんでした」とボタンを出す */
  onRetry?: () => void
  /** 歳出の節の行を押したとき（節の詳細を開く） */
  onSetsu?: (setsuId: string) => void
  /** 歳出の事業の行の行き先（事業の頁） */
  project?: ProjectLink
}) {
  if (!flows && onRetry) return (
    <div role="alert" className="flex flex-wrap items-center gap-2 py-6 text-sm text-destructive">
      <p>お金の流れを読み込めませんでした。</p>
      <Button variant="outline" onClick={onRetry}>もう一度読み込む</Button>
    </div>
  )
  // 読み込み中は、表と同じくらいの高さの skeleton を敷いて、読み終えたときに下の要素がずれないようにする
  if (!flows) return (
    <div role="status" aria-label="お金の流れを読み込んでいます" className="flex flex-col gap-2">
      <Skeleton className="h-6 w-16 rounded-md" />
      <Skeleton className="h-9 rounded-full" />
      {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
    </div>
  )
  const revenueTotal = (revenue ?? []).reduce((s, d) => s + (d.kan.amountMissing ? 0 : d.kan.yen), 0)
  return (
    <div className="flex flex-col gap-8">
      <Section title="歳出" drills={flows} total={total} query={query.expenditure} onQuery={(q) => onQuery('expenditure', q)} onSetsu={onSetsu} project={project} />
      {revenue?.length ? <Section title="歳入" drills={revenue} total={revenueTotal} query={query.revenue} onQuery={(q) => onQuery('revenue', q)} /> : null}
    </div>
  )
}
