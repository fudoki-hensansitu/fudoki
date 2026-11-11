// 試作: 自治体の頁をアプリ型にしたもの（品川区）。ヘッダーは今の頁のまま、その下をオブジェクト（分野・事業・評価シート）ごとの
// 一覧と詳細に分ける。一覧は名前と金額だけを出し、説明は詳細にだけ出す。部品は shadcn/ui（Tabs・Carousel・Sheet・Card・Input・ToggleGroup）
import * as React from 'react'
import {
  ArrowSquareOutIcon,
  BankIcon,
  BasketballIcon,
  BriefcaseIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretRightIcon,
  ChartPieSliceIcon,
  ClipboardTextIcon,
  DotsThreeCircleIcon,
  FileTextIcon,
  FirstAidKitIcon,
  GlobeIcon,
  HandHeartIcon,
  HouseLineIcon,
  LeafIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SparkleIcon,
  SquaresFourIcon,
  StorefrontIcon,
  StudentIcon,
  TreeStructureIcon,
  UsersIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Link } from '../../nav/link'
import { CutIcon, DoneIcon, FixIcon, JoinIcon, KeepIcon, LawIcon, MaybeStopIcon, NewIcon, PlanIcon, SizeIcon, StopIcon, UpIcon } from '../fresh-icons'
import { YearPicker } from '../year-picker'
import { Flow } from '../flow'
import { pageHead } from '../html'
import { EMBLEMS } from '../emblems'
import { assetPath } from '../profiles'
import { rememberJurisdiction } from '../../home/recent'
import { Hint } from '@/components/hint'
import { AskDock, Elsewhere } from '../page'
import { formatAsOf, formatPeople, reiwa, yearName, yearPath, type FlowView, type PageData, type YearTotal } from '../types'
import { DIRECTIONS, GRADES, yearView, type Measure, type Proj, type Sheet as EvalSheet, type Snapshot, type YearView } from './data'
import './app.css'

const FIELD_ICON: Record<string, Icon> = {
  bosai: ShieldCheckIcon, fukushi: HandHeartIcon, kyoiku: StudentIcon, iryo: FirstAidKitIcon, kurashi: HouseLineIcon,
  sangyo: StorefrontIcon, kankyo: LeafIcon, bunka: BasketballIcon, gyosei: BankIcon, other: DotsThreeCircleIcon,
}
const MARK_ICON: Record<string, (p: { className?: string }) => React.ReactNode> = {
  new: NewIcon, up: UpIcon, keep: KeepIcon, law: LawIcon, plan: PlanIcon, fix: FixIcon, size: SizeIcon, cut: CutIcon, done: DoneIcon, join: JoinIcon, stop: StopIcon, maybe: MaybeStopIcon,
}

// ---------- 金額 ----------
function yenParts(y: number): [string, string] {
  if (Math.abs(y) >= 1e8) {
    const v = y / 1e8
    return [v >= 100 ? Math.round(v).toLocaleString('ja-JP') : v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }), '億円']
  }
  return [Math.round(y / 1e4).toLocaleString('ja-JP'), '万円']
}
/** 数字を強調し、単位は小さく */
function Amt({ yen, className }: { yen: number | null | undefined; className?: string }) {
  if (yen == null) return <span className={cn('text-muted-foreground', className)}>—</span>
  const [n, u] = yenParts(yen)
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {n}
      <small className="ml-px text-[0.6em]">{u}</small>
    </span>
  )
}
const yenText = (y: number) => yenParts(y).join('')
const perHead = (y: number, pop: number) => {
  const v = y / pop
  return v >= 1e4 ? `1人 ${(v / 1e4).toFixed(1)}万円` : `1人 ${Math.round(v).toLocaleString('ja-JP')}円`
}
const r = (y: number) => `R${y - 2018}`

// ---------- 選んだもの（詳細） ----------
type Selected = { kind: 'field' | 'project' | 'measure' | 'sheet'; id: string } | null
type Ctx = { d: Snapshot; page: PageData; years: number[]; v: YearView; select: (s: Selected) => void; selected: Selected; projects: Map<string, Proj>; go: Go }
const AppContext = React.createContext<Ctx>(null!)
const useApp = () => React.useContext(AppContext)

// ---------- 小さな部品 ----------
function FieldIcon({ id, className }: { id: string; className?: string }) {
  const I = FIELD_ICON[id] ?? DotsThreeCircleIcon
  return <I className={className} aria-hidden="true" />
}
function Mark({ kind, label, className = 'size-6' }: { kind: string; label?: string; className?: string }) {
  const I = MARK_ICON[kind]
  if (!I) return null
  return (
    <span className="flex shrink-0 text-primary" title={label} aria-label={label} role={label ? 'img' : undefined}>
      <I className={className} />
    </span>
  )
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground [&_svg]:size-3">{children}</span>
}
function SectionHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold">
        {title}
        {sub ? <span className="ml-2 text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </h2>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
function MoreLink({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onClick}>
      すべて
      <CaretRightIcon data-icon="inline-end" />
    </Button>
  )
}

/** 一覧の行。押すと詳細を開く */
function Row({ icon, title, sub, yen, note, rank, selected, onClick }: { icon: React.ReactNode; title: string; sub?: string; yen: number | null | undefined; note?: string; rank?: number; selected?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-selected={selected || undefined} className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left transition-colors hover:bg-card data-selected:bg-accent">
      {rank != null ? <span className="w-5 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">{rank}</span> : null}
      {icon}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-normal">{title}</span>
        {sub ? <span className="block truncate text-[11px] text-muted-foreground">{sub}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <Amt yen={yen} className="text-base" />
        {note ? <span className="block text-[11px] text-muted-foreground">{note}</span> : null}
      </span>
      <CaretRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}
const IconBox = ({ children }: { children: React.ReactNode }) => <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-card text-muted-foreground [&_svg]:size-4">{children}</span>

function ProjectRow({ p, rank }: { p: Proj; rank?: number }) {
  const { v, select, selected } = useApp()
  const ended = v.isEnded(p)
  const yen = ended ? p.y[String(v.year - 1)]?.b : p.y[String(v.year)]?.b
  const icon = ended ? <Mark kind="stop" label="やめた事業" /> : v.isNew(p) ? <Mark kind="new" label="新しく始める事業" /> : <IconBox><FieldIcon id={p.field} /></IconBox>
  return <Row rank={rank} icon={icon} title={p.name} sub={[p.dept, fieldName(v, p.field)].filter(Boolean).join(' · ')} yen={yen} note={ended ? `${r(v.year - 1)} ${v.label(v.year - 1)}` : `${((yen! / v.total) * 100).toFixed(1)}%`} selected={selected?.kind === 'project' && selected.id === p.id} onClick={() => select({ kind: 'project', id: p.id })} />
}
function MeasureRow({ m }: { m: Measure }) {
  const { v, select, selected } = useApp()
  return <Row icon={<Mark kind={m.new ? 'new' : 'up'} />} title={m.title} sub={fieldName(v, m.field)} yen={m.yen} selected={selected?.kind === 'measure' && selected.id === m.id} onClick={() => select({ kind: 'measure', id: m.id })} />
}
function SheetRow({ s }: { s: EvalSheet }) {
  const { select, selected } = useApp()
  const dir = s.dir ? DIRECTIONS[s.dir] : undefined
  return <Row icon={dir ? <Mark kind={dir.icon} label={dir.label} /> : <IconBox><ClipboardTextIcon /></IconBox>} title={s.name} sub={[s.div, dir?.label ?? s.dir].filter(Boolean).join(' · ')} yen={s.s} note={`${r(s.fy)} 決算`} selected={selected?.kind === 'sheet' && selected.id === s.id} onClick={() => select({ kind: 'sheet', id: s.id })} />
}
/** 行の間に Separator を挟む */
function Rows({ children }: { children: React.ReactNode[] }) {
  return <div className="flex flex-col">{children.map((c, i) => <React.Fragment key={i}>{i ? <Separator /> : null}{c}</React.Fragment>)}</div>
}
const fieldName = (v: YearView, id: string) => v.fields.find((f) => f.id === id)?.name ?? 'その他'

/** 一覧は下まで来たら続きを足す（無限スクロール） */
function Infinite<T>({ items, render, step = 30 }: { items: T[]; render: (t: T, i: number) => React.ReactNode; step?: number }) {
  const [n, setN] = React.useState(step)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => setN(step), [items, step])
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e!.isIntersecting && setN((x) => x + step), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [n, items, step])
  return (
    <>
      <Rows>{items.slice(0, n).map(render)}</Rows>
      {items.length > n ? (
        <div ref={ref} className="flex justify-center gap-1.5 py-5" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} className="app-dot size-1.5 rounded-full bg-border" style={{ animationDelay: `${i * 150}ms` }} />)}
        </div>
      ) : null}
    </>
  )
}

// ---------- 画面 ----------
type TabKey = 'overview' | 'projects' | 'money'
type Go = (t: TabKey, opt?: { filter?: string; field?: string; grade?: string }) => void

function CountCard({ icon, label, n, onClick }: { icon: React.ReactNode; label: string; n: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block h-full w-full rounded-xl text-left transition-transform active:scale-[.98]"><Card className="h-full gap-1.5 bg-card px-4 py-3.5 text-left ring-0 transition-[background,transform] hover:bg-secondary active:scale-[.98]">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-4">{icon}{label}</span>
      <span className="text-[26px] leading-tight tabular-nums">
        {n}
        <small className="ml-1 text-xs text-muted-foreground">件</small>
      </span>
    </Card></button>
  )
}

function FieldTile({ f, i, onClick }: { f: YearView['fields'][number]; i: number; onClick: () => void }) {
  const { v } = useApp()
  const n = v.current.filter((p) => p.field === f.id).length
  const pct = (f.yen / v.total) * 100
  return (
    <button type="button" onClick={onClick} className="block h-full w-full rounded-xl text-left transition-transform active:scale-[.98]"><Card className="h-full gap-2.5 bg-background p-3.5 text-left ring-1 ring-border transition-[background,box-shadow,transform] hover:bg-accent hover:ring-primary active:scale-[.98]">
      <span className="flex items-center justify-between">
        <IconBox><FieldIcon id={f.id} /></IconBox>
        <span className="text-[22px] tabular-nums text-primary">
          {pct.toFixed(1)}
          <small className="text-xs">%</small>
        </span>
      </span>
      <span>
        <span className="block text-sm font-semibold">{f.name}</span>
        <span className="text-xs text-muted-foreground"><Amt yen={f.yen} /> · 事業 {n}</span>
      </span>
      <span className="block h-1 overflow-hidden rounded-full bg-secondary">
        <span className="app-grow block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, pct * 1.8)}%`, animationDelay: `${i * 30}ms` }} />
      </span>
    </Card></button>
  )
}

/** 新しく始める事業のカード。施策のうち予算書の事業に当たったものは事業の詳細を開く */
function FreshCard({ m }: { m: Measure }) {
  const { v, select, projects } = useApp()
  const p = m.project ? projects.get(m.project) : undefined
  return (
    <button type="button" onClick={() => select(p ? { kind: 'project', id: p.id } : { kind: 'measure', id: m.id })} className="block h-full w-full rounded-xl text-left transition-transform active:scale-[.98]"><Card className="h-full h-full min-h-[132px] gap-2.5 bg-card p-3.5 text-left ring-0 transition-[background,transform] hover:bg-secondary active:scale-[.98]">
      <Mark kind={m.new ? 'new' : 'up'} />
      <span className="line-clamp-2 text-sm font-semibold leading-normal">{m.title}</span>
      <span className="mt-auto flex items-end justify-between gap-2">
        <Chip><FieldIcon id={m.field} />{fieldName(v, m.field)}</Chip>
        <Amt yen={m.yen} className="text-primary" />
      </span>
    </Card></button>
  )
}

function FreshCarousel({ items, more }: { items: Measure[]; more?: () => void }) {
  if (!items.length) return null
  return (
    <section>
      <SectionHead title="新しく始める事業">{more ? <MoreLink onClick={more} /> : null}</SectionHead>
      {/* 前へ・次へは shadcn の Carousel のとおりカードの左右に置く（スマホはスワイプだけ） */}
      <Carousel opts={{ align: 'start', slidesToScroll: 'auto' }} className="w-full md:px-11">
        <CarouselContent className="-ml-2.5">
          {items.map((m) => (
            <CarouselItem key={m.id} className="basis-4/5 pl-2.5 sm:basis-1/3 @3xl:basis-1/4">
              <FreshCard m={m} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-0 max-md:hidden" />
        <CarouselNext className="right-0 max-md:hidden" />
      </Carousel>
    </section>
  )
}

function GradeCards({ sheets, value, onChange }: { sheets: EvalSheet[]; value?: string; onChange?: (g: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {GRADES.map(([g, label]) => (
        <button key={g}
          type="button" aria-pressed={value === g} onClick={() => onChange?.(g)} className="block h-full w-full rounded-xl text-left transition-transform active:scale-[.98]"><Card className={cn('h-full', 'gap-1 bg-background px-3.5 py-3 text-left ring-1 ring-border transition-colors hover:bg-card', value === g && 'bg-accent ring-primary hover:bg-accent')}>
          <span className="flex items-center gap-1.5 text-[13px]">
            <span className="grid size-5 place-items-center rounded-full border border-current text-[11px]">{g}</span>
            {label}
          </span>
          <span className="text-[26px] leading-tight tabular-nums">
            {sheets.filter((s) => s.grade === g).length}
            <small className="ml-1 text-xs text-muted-foreground">事業</small>
          </span>
        </Card></button>
      ))}
    </div>
  )
}

/** お金の流れの分け方。分野（COFOG の大分類）か、予算書・決算書の款・項のまま */
const VIEWS: { key: FlowView; label: string }[] = [
  { key: 'cofog', label: '分野' },
  { key: 'kan', label: '款・項' },
]

/** 予算。事業は下から積み上げる見方、こちらは大きい項目から下りていく見方。決算のある年度は決算、無ければ当初予算の流れ */
function MoneyTab() {
  const { v, page } = useApp()
  const [view, setView] = React.useState<FlowView>('cofog')
  const settled = page.years.find((y) => y.year === v.year)
  const budget = settled ? undefined : page.budgets.find((b) => b.year === v.year)
  const total: YearTotal | undefined = settled ?? (budget ? { year: v.year, yen: budget.yen, kan: budget.kan } : undefined)
  const label = budget ? '当初予算' : '決算'
  const tabs = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-base">{reiwa(v.year)}の{label}</span>
      <ToggleGroup value={[view]} onValueChange={(x) => x[0] && setView(x[0] as FlowView)} variant="outline" size="sm" spacing={0}>
        {VIEWS.map((x) => <ToggleGroupItem key={x.key} value={x.key}>{x.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  )
  const summary = total ? <Amt yen={total.yen} className="text-[26px] leading-snug text-primary" /> : null
  return (
    <div className="flex flex-col gap-3">
      {total ? (
        <Flow key={`${v.year}-${view}`} data={page} total={total} view={view} phase={budget ? 'initial' : 'settlement'} tabs={tabs} summary={summary} className="h-[calc(100svh-12rem)] scroll-mt-16 @4xl:h-[calc(100svh-10rem)] @4xl:scroll-mt-16" />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">{reiwa(v.year)}の決算・予算は、まだ収録していません</p>
      )}
      <p className="text-[11px] text-muted-foreground">分野は使い道を目的ごとに分ける世界共通の分類（COFOG）で、分け方は風土記の判断です。款・項は予算書・決算書の分け方のままです。</p>
    </div>
  )
}

function Overview({ go }: { go: Go }) {
  const { v, select, page } = useApp()
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <Card className="gap-0 bg-card px-5 py-[18px] ring-0">
          <span className="text-xs text-muted-foreground">{reiwa(v.year)}の{v.word}（一般会計）</span>
          <Amt yen={v.total} className="mt-0.5 text-[40px] leading-tight text-primary max-sm:text-[34px]" />
          <span className="mt-3 text-xs text-muted-foreground">住民1人あたり</span>
          <Amt yen={v.perHead} className="text-[22px] text-primary" />
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><CountCard icon={<ListBulletsIcon />} label="事業" n={v.current.length} onClick={() => go('projects', { filter: 'all' })} /></div>
          {v.hasPrev || v.fresh.length ? (
            <>
              <CountCard icon={<NewIcon className="text-primary" />} label="新しく始める事業" n={v.newProjects.length + v.freshUnlinked.length} onClick={() => go('projects', { filter: 'new' })} />
              <CountCard icon={<StopIcon className="text-primary" />} label="やめた事業" n={v.ended.length} onClick={() => go('projects', { filter: 'ended' })} />
            </>
          ) : null}
          {v.sheets.length ? <div className="col-span-2"><CountCard icon={<ClipboardTextIcon />} label="評価した事業" n={v.sheets.length} onClick={() => go('projects', { filter: 'eval' })} /></div> : null}
        </div>
      </div>

      <section>
        <SectionHead title="分野" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 @3xl:grid-cols-5">
          {v.fields.map((f, i) => <FieldTile key={f.id} f={f} i={i} onClick={() => select({ kind: 'field', id: f.id })} />)}
        </div>
      </section>

      <FreshCarousel items={v.fresh.slice(0, 12)} more={() => go('projects', { filter: 'new' })} />

      <section>
        <SectionHead title="お金のかかる事業"><MoreLink onClick={() => go('projects', { filter: 'all' })} /></SectionHead>
        <Rows>{v.current.slice(0, 5).map((p, i) => <ProjectRow key={p.id} p={p} rank={i + 1} />)}</Rows>
      </section>

      {v.sheets.length ? (
        <section>
          <SectionHead title="事業評価" sub={`${r(v.year)}年度の事業`}><MoreLink onClick={() => go('projects', { filter: 'eval' })} /></SectionHead>
          <GradeCards sheets={v.sheets} onChange={(g) => go('projects', { filter: 'eval', grade: g })} />
        </section>
      ) : null}
      <Elsewhere data={page} />
    </div>
  )
}

function ProjectsTab({ filter, setFilter, field, setField, grade, setGrade }: { filter: string; setFilter: (f: string) => void; field: string; setField: (f: string) => void; grade: string; setGrade: (g: string) => void }) {
  const { v } = useApp()
  const by = filter === 'ended' ? v.year - 1 : v.year
  const byLabel = `${r(by)} ${v.label(by)}`
  const [q, setQ] = React.useState('')
  const items = React.useMemo(() => {
    let ps = filter === 'ended' ? v.ended : filter === 'new' ? v.newProjects : v.current
    if (field !== 'all') ps = ps.filter((p) => p.field === field)
    const t = q.trim()
    if (t) ps = ps.filter((p) => p.name.includes(t) || (p.dept ?? '').includes(t))
    return ps
  }, [v, filter, field, q])
  const unlinked = filter === 'new' ? v.freshUnlinked.filter((m) => (field === 'all' || m.field === field) && (!q.trim() || m.title.includes(q.trim()))) : []
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="事業名・担当の課で探す" className="h-9 rounded-full pl-9" aria-label="事業を探す" />
        </div>
        <ToggleGroup value={[filter]} onValueChange={(x) => x[0] && setFilter(x[0])} variant="outline" size="sm" spacing={0}>
          <ToggleGroupItem value="all">すべて</ToggleGroupItem>
          {v.hasPrev || v.fresh.length ? <ToggleGroupItem value="new"><NewIcon className="size-4 text-primary" />新しく始める</ToggleGroupItem> : null}
          {v.hasPrev ? <ToggleGroupItem value="ended"><StopIcon className="size-4 text-primary" />やめた</ToggleGroupItem> : null}
          {v.sheets.length ? <ToggleGroupItem value="eval"><ClipboardTextIcon className="size-4" />評価した</ToggleGroupItem> : null}
        </ToggleGroup>
      </div>
      <ToggleGroup value={[field]} onValueChange={(x) => x[0] && setField(x[0])} variant="outline" size="sm" className="-mx-1 w-auto overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        <ToggleGroupItem value="all" className="rounded-full">すべての分野</ToggleGroupItem>
        {v.fields.map((f) => (
          <ToggleGroupItem key={f.id} value={f.id} className="rounded-full"><FieldIcon id={f.id} />{f.name}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      {filter === 'eval' ? <EvalList grade={grade} setGrade={setGrade} field={field} q={q} /> : <>
      <p className="px-2.5 text-xs text-muted-foreground">
        {filter === 'new' ? '新規の施策が付いた事業と、予算書で新しく現れた事業・' : ''}
        {items.length}件・{byLabel}の多い順
      </p>
      <Infinite items={items} render={(p, i) => <ProjectRow key={p.id} p={p} rank={i + 1} />} />
      {unlinked.length ? (
        <section className="mt-4">
          <p className="px-2.5 pb-1 text-xs text-muted-foreground">予算書の事業に紐付けられなかった発表 {unlinked.length}件</p>
          <Rows>{unlinked.map((m) => <MeasureRow key={m.id} m={m} />)}</Rows>
        </section>
      ) : null}
      </>}
    </div>
  )
}

/** 事業の一覧の「評価した」。評価は事業の属性なので、別のタブにせず事業の絞り込みの1つにする */
function EvalList({ grade, setGrade, field, q }: { grade: string; setGrade: (g: string) => void; field: string; q: string }) {
  const { v } = useApp()
  const t = q.trim()
  const all = v.sheets.filter((s) => (field === 'all' || s.field === field) && (!t || s.name.includes(t) || (s.div ?? '').includes(t)))
  const ss = all.filter((s) => s.grade === grade).sort((a, b) => (b.s ?? 0) - (a.s ?? 0))
  const dirs = Object.entries(DIRECTIONS).map(([k, x]) => [x, ss.filter((s) => s.dir === k).length] as const).filter(([, n]) => n)
  return (
    <div className="mt-1 flex flex-col gap-3">
      <GradeCards sheets={all} value={grade} onChange={setGrade} />
      <div className="flex flex-wrap gap-1.5">
        {dirs.map(([x, n]) => (
          <span key={x.label} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"><Mark kind={x.icon} className="size-[18px]" />{x.label} {n}</span>
        ))}
      </div>
      <Infinite items={ss} render={(s) => <SheetRow key={s.id} s={s} />} />
      <p className="text-[11px] text-muted-foreground">区が {r(v.year)}年度に行った事業を自ら評価した結果（A〜D は区の区分）です。風土記は評価を加えていません。</p>
    </div>
  )
}

// ---------- 詳細 ----------
function DetailSection({ icon: I, title, count, children }: { icon: Icon; title: string; count?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><I className="size-4 text-muted-foreground" aria-hidden="true" />{title}{count != null ? <span className="font-normal text-muted-foreground">{count}</span> : null}</h3>
      {children}
    </section>
  )
}
const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">{children}<ArrowSquareOutIcon className="size-3" aria-hidden="true" /></a>
)

function ProjectDetail({ p }: { p: Proj }) {
  const { v, d, select, years } = useApp()
  const ys = String(v.year)
  const now = v.amount(p)
  const prev = v.amount(p, String(v.year - 1))
  const ms = v.measuresOf.get(p.id) ?? []
  const ss = v.sheetsOf.get(p.id) ?? []
  const kids = p.kids[ys] ?? []
  const ended = v.isEnded(p)
  return (
    <>
      <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">{p.path.filter(Boolean).map((x, i) => <React.Fragment key={i}>{i ? <CaretRightIcon className="size-2.5" /> : null}{x}</React.Fragment>)}</p>
      <h2 className="mt-1.5 mb-2 flex items-start gap-1.5 text-xl font-semibold leading-snug">
        {ended ? <Mark kind="stop" label="やめた事業" /> : v.isNew(p) ? <Mark kind="new" label="新しく始める事業" /> : null}
        {p.name}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        <Chip><FieldIcon id={p.field} />{fieldName(v, p.field)}</Chip>
        {p.dept ? <Chip><BuildingsIcon />{p.dept}</Chip> : null}
      </div>
      <div className="mt-5">
        {ended ? (
          <>
            <span className="text-xs text-muted-foreground">{reiwa(v.year)}の{v.word}書には載っていません</span>
            <Amt yen={prev} className="block text-4xl leading-tight" />
            <span className="text-xs text-muted-foreground">{r(v.year - 1)}年度の{v.label(v.year - 1)}</span>
          </>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">{reiwa(v.year)}の{v.word}</span>
            <Amt yen={now} className="block text-4xl leading-tight text-primary" />
            {now != null ? <span className="text-xs text-muted-foreground">{perHead(now, d.pop)}{prev ? ` · ${r(v.year - 1)}年度から ${now >= prev ? '+' : '−'}${yenText(Math.abs(now - prev))}` : ''}</span> : <span className="text-xs text-muted-foreground">当初予算には載っていません{p.y[ys]?.s != null ? `（決算 ${yenText(p.y[ys]!.s!)}）` : ''}</span>}
          </>
        )}
      </div>
      <DetailSection icon={CalendarBlankIcon} title="年度ごと">
        <div className="grid grid-cols-[auto_1fr_1fr] text-[13px]">
          <span className="py-1.5 text-[11px]" /><span className="py-1.5 text-right text-[11px] text-muted-foreground">当初予算</span><span className="px-1 py-1.5 text-right text-[11px] text-muted-foreground">決算</span>
          {years.slice().reverse().map((y) => (
            <div key={y} className={cn('col-span-full grid grid-cols-subgrid', y === v.year && 'bg-card')}>
              <Separator className="col-span-full" />
              <span className="px-1 py-2">{r(y)}</span>
              <span className="py-2 text-right"><Amt yen={p.y[y]?.b} className="text-[15px]" /></span>
              <span className="px-1 py-2 text-right"><Amt yen={p.y[y]?.s} className="text-[15px]" /></span>
            </div>
          ))}
        </div>
      </DetailSection>
      {ms.length ? (
        <DetailSection icon={SparkleIcon} title="予算案で発表したこと" count={ms.length}>
          <div className="flex flex-col gap-2">
            {ms.map((m) => (
              <div key={m.id} className="flex gap-2.5 rounded-xl bg-card p-3">
                <Mark kind={m.new ? 'new' : 'up'} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{m.title}</p>
                  <ul className="mt-1.5 list-disc pl-4 text-xs leading-relaxed">{m.desc.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{m.new ? '新規' : '拡大'} · 予算案 {m.yen != null ? yenText(m.yen) : '—'}</span><Ext href={`${m.url}#page=${m.page}`}>発表資料</Ext></div>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">発表の施策と予算書の事業の紐付けは風土記の判断です。</p>
          </div>
        </DetailSection>
      ) : null}
      {ss.length ? (
        <DetailSection icon={ClipboardTextIcon} title="事業評価" count={`${r(v.year)}年度の事業`}>
          {ss.map((s) => {
            const dir = s.dir ? DIRECTIONS[s.dir] : undefined
            return (
              <button key={s.id} type="button" onClick={() => select({ kind: 'sheet', id: s.id })} className="mb-2 flex w-full items-start gap-2.5 rounded-xl bg-card p-3 text-left hover:bg-secondary">
                {dir ? <Mark kind={dir.icon} /> : null}
                <span><span className="block text-[13px] font-semibold">{s.name}</span><span className="text-xs text-muted-foreground">評価 {s.grade} {GRADES.find((g) => g[0] === s.grade)![1]} · {dir?.label ?? s.dir}</span></span>
              </button>
            )
          })}
        </DetailSection>
      ) : null}
      {kids.length ? (
        <DetailSection icon={TreeStructureIcon} title="中の事業" count={kids.length}>
          <Rows>{kids.slice(0, 8).map(([name, yen], i) => (
            <div key={i} className="flex items-center gap-3 px-1.5 py-2 text-[13px]"><span className="flex-1">{name}</span><Amt yen={yen} className="text-sm" /></div>
          ))}</Rows>
          {kids.length > 8 ? <p className="mt-1 text-[11px] text-muted-foreground">ほか {kids.length - 8} 件</p> : null}
        </DetailSection>
      ) : null}
      {v.origin ? <DetailSection icon={FileTextIcon} title="出典"><Ext href={v.origin}>{v.originTitle ?? '予算書'}</Ext></DetailSection> : null}
    </>
  )
}

function MeasureDetail({ m }: { m: Measure }) {
  const { v, d } = useApp()
  return (
    <>
      <h2 className="mb-2 flex items-start gap-1.5 text-xl font-semibold leading-snug"><Mark kind={m.new ? 'new' : 'up'} />{m.title}</h2>
      <Chip><FieldIcon id={m.field} />{fieldName(v, m.field)}</Chip>
      <div className="mt-5">
        <span className="text-xs text-muted-foreground">{reiwa(v.year)}の予算案</span>
        <Amt yen={m.yen} className="block text-4xl leading-tight text-primary" />
        {m.yen ? <span className="text-xs text-muted-foreground">{perHead(m.yen, d.pop)}</span> : null}
      </div>
      <DetailSection icon={ListBulletsIcon} title="ポイント"><ul className="list-disc pl-5 text-[13px] leading-loose">{m.desc.map((x, i) => <li key={i}>{x}</li>)}</ul></DetailSection>
      <DetailSection icon={FileTextIcon} title="出典"><Ext href={`${m.url}#page=${m.page}`}>予算案のプレス発表（{m.page}頁）</Ext></DetailSection>
    </>
  )
}

function SheetDetail({ s }: { s: EvalSheet }) {
  const { select, projects } = useApp()
  const dir = s.dir ? DIRECTIONS[s.dir] : undefined
  const p = s.project ? projects.get(s.project) : undefined
  return (
    <>
      <p className="text-[11px] text-muted-foreground">{s.acct} · {s.div}</p>
      <h2 className="mt-1.5 text-xl font-semibold leading-snug">{s.name}</h2>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Card className="gap-1 bg-accent px-3.5 py-3 ring-1 ring-primary">
          <span className="flex items-center gap-1.5 text-[13px]"><span className="grid size-5 place-items-center rounded-full border border-current text-[11px]">{s.grade}</span>評価</span>
          <span className="text-lg">{GRADES.find((g) => g[0] === s.grade)![1]}</span>
        </Card>
        <Card className="gap-1 bg-background px-3.5 py-3 ring-1 ring-border">
          <span className="flex items-center gap-1.5 text-[13px]">{dir ? <Mark kind={dir.icon} className="size-5" /> : null}今後の方向</span>
          <span className="text-base">{dir?.label ?? s.dir ?? '—'}</span>
        </Card>
      </div>
      <DetailSection icon={CalendarBlankIcon} title={`${r(s.fy)}年度の小事業`}>
        <div className="flex gap-8 text-[13px]"><span>予算 <Amt yen={s.b} className="text-[15px]" /></span><span>決算 <Amt yen={s.s} className="text-[15px]" /></span></div>
      </DetailSection>
      {p ? (
        <DetailSection icon={BriefcaseIcon} title="予算書の事業">
          <button type="button" onClick={() => select({ kind: 'project', id: p.id })} className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left hover:bg-secondary">
            <span className="flex-1"><span className="block text-[13px] font-semibold">{p.name}</span><span className="text-xs text-muted-foreground">{p.dept}</span></span>
            <CaretRightIcon className="size-3.5 text-muted-foreground" />
          </button>
        </DetailSection>
      ) : null}
      <DetailSection icon={FileTextIcon} title="出典"><Ext href={`${s.url}#page=${s.page}`}>評価シート（{s.page}頁）</Ext></DetailSection>
      <p className="mt-3 text-[11px] text-muted-foreground">評価は区が自ら付けたものです。風土記は評価を加えていません。</p>
    </>
  )
}

/** 分野の詳細。分野はまとめのタイルから開く */
function FieldDetail({ id }: { id: string }) {
  const { v, d, go, select } = useApp()
  const f = v.fields.find((x) => x.id === id)
  if (!f) return <p className="text-sm text-muted-foreground">{reiwa(v.year)}にはこの分野の予算がありません。</p>
  const ps = v.current.filter((p) => p.field === f.id)
  const ms = v.fresh.filter((m) => m.field === f.id)
  const ss = v.sheets.filter((s) => s.field === f.id)
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-card text-muted-foreground"><FieldIcon id={f.id} className="size-6" /></span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-snug">{f.name}</h2>
          <p className="text-xs text-muted-foreground">{f.examples}</p>
        </div>
      </div>
      <div className="mt-5">
        <span className="text-xs text-muted-foreground">{reiwa(v.year)}の{v.word}</span>
        <Amt yen={f.yen} className="block text-4xl leading-tight text-primary" />
        <span className="text-xs text-muted-foreground">全体の {((f.yen / v.total) * 100).toFixed(1)}% · {perHead(f.yen, d.pop)}</span>
      </div>
      {ms.length ? (
        <DetailSection icon={SparkleIcon} title="新しく始める事業" count={ms.length}>
          <Rows>{ms.map((m) => <MeasureRow key={m.id} m={m} />)}</Rows>
        </DetailSection>
      ) : null}
      <DetailSection icon={ListBulletsIcon} title="お金のかかる事業" count={`${ps.length}件`}>
        <Rows>{ps.slice(0, 5).map((p, i) => <ProjectRow key={p.id} p={p} rank={i + 1} />)}</Rows>
        <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { select(null); go('projects', { filter: 'all', field: f.id }) }}>
          この分野の事業をすべて見る
          <CaretRightIcon data-icon="inline-end" />
        </Button>
      </DetailSection>
      {v.sheets.length ? (
        <DetailSection icon={ClipboardTextIcon} title="事業評価" count={`${r(v.year)}年度の事業`}>
          <GradeCards sheets={ss} />
        </DetailSection>
      ) : null}
      <p className="mt-6 text-[11px] text-muted-foreground">分野は COFOG（政府支出の機能別分類）の大分類です。分け方は風土記の判断です。</p>
    </>
  )
}

function Detail({ sel }: { sel: NonNullable<Selected> }) {
  const { d } = useApp()
  const kind = { field: ['分野', ChartPieSliceIcon], project: ['事業', BriefcaseIcon], measure: ['新しく始めること', SparkleIcon], sheet: ['事業評価', ClipboardTextIcon] } as const
  const [label, I] = kind[sel.kind]
  const body =
    sel.kind === 'field' ? <FieldDetail id={sel.id} /> : sel.kind === 'project' ? <ProjectDetail p={d.projects.find((p) => p.id === sel.id)!} /> : sel.kind === 'measure' ? <MeasureDetail m={d.measures.find((m) => m.id === sel.id)!} /> : <SheetDetail s={d.sheets.find((s) => s.id === sel.id)!} />
  return (
    <div key={`${sel.kind}${sel.id}`} className="app-in">
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground"><I className="size-3.5" aria-hidden="true" />{label}</p>
      {body}
    </div>
  )
}

function useMedia(query: string) {
  const [on, setOn] = React.useState(false)
  React.useEffect(() => {
    const m = matchMedia(query)
    const f = () => setOn(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [query])
  return on
}

/** スマホの年度。選んでいる年度だけを出し、押すとメニューで切り替える */
function YearMenu({ years, current, onChange }: { years: number[]; current: number; onChange: (y: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-[13px] text-foreground">
        {yearName(current)}
        <span className="text-muted-foreground">（{reiwa(current).replace(/年度$/, '')}）</span>
        <CaretDownIcon className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuRadioGroup value={String(current)} onValueChange={(v) => onChange(Number(v))}>
          {years.map((y) => (
            <DropdownMenuRadioItem key={y} value={String(y)}>{yearName(y)}（{reiwa(y).replace(/年度$/, '')}）</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------- 頁 ----------
const TABS: { key: TabKey; label: string; icon: Icon }[] = [
  { key: 'overview', label: 'まとめ', icon: SquaresFourIcon },
  { key: 'projects', label: '事業', icon: ListBulletsIcon },
  { key: 'money', label: '予算', icon: TreeStructureIcon },
]

/** 頁の年度（新しい順に3年）。決算の年度と、決算より後の当初予算の年度 */
const YEAR_COUNT = 3
const pageYearsOf = (data: PageData) => [...new Set([...data.years.map((y) => y.year), ...data.budgets.map((b) => b.year)])].sort((a, b) => b - a).slice(0, YEAR_COUNT)
/** 今の URL から年度の段を除いた、自治体の頁の path */
const basePath = () => location.pathname.replace(/\/\d{4}\/?$/, '')

export function AppPage({ data, sitekey, initialYear }: { data: PageData; sitekey: string; initialYear?: number }) {
  const vision = data.profile?.vision?.text
  const emblem = EMBLEMS[data.code] ? assetPath(data.code, 'emblem.svg') : null
  const years = React.useMemo(() => pageYearsOf(data), [data])
  const [d, setD] = React.useState<Snapshot>()
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => rememberJurisdiction({ code: data.code, name: data.name, path: basePath() }), [data.code, data.name])
  React.useEffect(() => {
    fetch(`/api/jurisdictions/app/${data.code}`)
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(new Error(String(r.status)))))
      .then(setD, () => setFailed(true))
  }, [data.code])
  const [year, setYearState] = React.useState(initialYear && years.includes(initialYear) ? initialYear : years[0]!)
  // 年度を選んだら、その年度の頁の path にする（既定の年度は自治体の頁そのもの）。頁は読み直さないので title も合わせる
  const setYear = (y: number) => {
    setYearState(y)
    history.replaceState(null, '', yearPath(basePath(), y, years[0]!))
    document.title = pageHead(data, y === years[0] ? undefined : y).title
  }
  const [tab, setTab] = React.useState<TabKey>('overview')
  const [field, setField] = React.useState('all')
  const [filter, setFilter] = React.useState('all')
  const [grade, setGrade] = React.useState('A')
  const [selected, select] = React.useState<Selected>(null)
  const wide = useMedia('(min-width: 1280px)')
  const phone = useMedia('(max-width: 767px)')
  const v = React.useMemo(() => (d?.years[year] ? yearView(d, year) : undefined), [d, year])
  const projects = React.useMemo(() => new Map((d?.projects ?? []).map((p) => [p.id, p])), [d])

  // タブの真上の目印。これが画面の上へ消えたら、タブが上に貼り付いている
  const tabsTop = React.useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = React.useState(false)
  React.useEffect(() => {
    const el = tabsTop.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting && e!.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [d])
  const changeTab = (t: TabKey) => {
    setTab(t)
    const el = tabsTop.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }
  const go: Go = (t, opt = {}) => {
    if (opt.filter) setFilter(opt.filter)
    if (opt.grade) setGrade(opt.grade)
    if (t === 'projects') setField(opt.field ?? 'all')
    changeTab(t)
  }

  // スマホではタブの中身を左右のスワイプで切り替える（shadcn の Carousel）。高さは今のタブに合わせる
  const [api, setApi] = React.useState<CarouselApi>()
  const tabs = TABS
  const tabsRef = React.useRef(tabs)
  // 事業評価は評価した事業を行った年度にだけある。評価の無い年度へ移ったら絞り込みを戻す
  const hasEval = !!v?.sheets.length
  React.useEffect(() => {
    if (v && !hasEval && filter === 'eval') setFilter('all')
  }, [v, hasEval, filter])
  const index = Math.max(0, tabs.findIndex((t) => t.key === tab))
  React.useEffect(() => {
    if (!api) return
    const onSelect = () => changeTab(tabsRef.current[api.selectedScrollSnap()]!.key)
    api.on('select', onSelect)
    return () => void api.off('select', onSelect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  React.useEffect(() => {
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index)
  }, [api, index])
  const slides = React.useRef<(HTMLDivElement | null)[]>([])
  const [height, setHeight] = React.useState<number>()
  React.useEffect(() => {
    if (!phone) return
    const el = slides.current[index]
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [phone, index, v])

  const header = (
    <header className="relative grid grid-cols-[80px_minmax(0,1fr)] items-end gap-4 py-7 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-6">
      <div className="col-span-full -mb-2 justify-self-end sm:absolute sm:right-0 sm:top-7 sm:mb-0">
        {phone ? <YearMenu years={years} current={year} onChange={setYear} /> : <YearPicker years={years} current={year} onChange={setYear} />}
      </div>
      <div className="grid size-20 place-items-center rounded-xl border bg-emblem p-2.5 sm:size-[108px] sm:rounded-2xl sm:p-4">
        {emblem ? <img src={emblem} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <span className="text-3xl text-foreground sm:text-5xl">{data.name[0]}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h1 className="text-[26px] font-normal leading-tight sm:text-[30px]">{data.name}</h1>
        {vision ? <p className="text-[17px]">{vision}</p> : null}
        <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 whitespace-nowrap text-xs text-muted-foreground sm:gap-x-6 sm:text-sm">
          <span className="inline-flex items-center gap-1 sm:gap-1.5"><MapPinIcon className="size-3.5 sm:size-4" aria-hidden="true" /><Button variant="link" size="inline" nativeButton={false} render={<Link href={data.prefecturePath} />}>{data.prefecture}</Button></span>
          {data.population ? (
            <Hint label={`住民基本台帳人口（${formatAsOf(data.population.asOf)}時点）`}>
              <span className="inline-flex items-center gap-1 text-foreground sm:gap-1.5"><UsersIcon className="size-3.5 text-muted-foreground sm:size-4" aria-hidden="true" /><span className="sr-only">人口 </span>{formatPeople(data.population.people)}</span>
            </Hint>
          ) : null}
          {data.officialUrl ? <span className="inline-flex items-center gap-1 sm:gap-1.5"><GlobeIcon className="size-3.5 sm:size-4" aria-hidden="true" /><Button variant="link" size="inline" nativeButton={false} render={<a href={data.officialUrl} target="_blank" rel="noopener" />}>公式サイト</Button></span> : null}
        </div>
      </div>
    </header>
  )

  const panel = (key: TabKey) =>
    !v ? null : key === 'overview' ? <Overview go={go} /> : key === 'money' ? <MoneyTab /> : <ProjectsTab filter={filter} setFilter={setFilter} field={field} setField={setField} grade={grade} setGrade={setGrade} />

  return (
    <div className={cn('transition-[padding] duration-300', wide && selected && 'pr-[440px]')}>
      <div className="@container mx-auto max-w-[1120px] px-4 pb-48">
        {header}
        <Separator />
        <Tabs value={tab} onValueChange={(t) => changeTab(t as TabKey)} className="gap-0">
          <div ref={tabsTop} aria-hidden="true" />
          <div className="sticky top-0 z-20 -mx-4 bg-background">
            {/* 下線を区切りの線に重ねて、線が二重に見えないようにする */}
            <Separator className="absolute inset-x-4 bottom-0 data-horizontal:w-auto" />
            {/* スクロールしたら上にタブを残し、右に年度の切り替えを出す。下に Separator を引いて中身と分ける */}
            <div className="flex items-center gap-3 px-4">
            <TabsList variant="line" className="relative z-10 min-w-0 flex-1 justify-start gap-2 overflow-x-auto p-0 [scrollbar-width:none] group-data-horizontal/tabs:h-12 sm:gap-4 sm:group-data-horizontal/tabs:h-[52px]">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="h-full flex-none gap-2 px-3 py-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:text-foreground text-[15px] leading-none group-data-horizontal/tabs:after:bottom-0 sm:text-[17px] [&_svg:not([class*='size-'])]:size-5">
                  <t.icon />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
              {stuck ? <div className="app-in shrink-0">{phone ? <YearMenu years={years} current={year} onChange={setYear} /> : <YearPicker years={years} current={year} onChange={setYear} />}</div> : null}
            </div>
          </div>
          {v ? (
            <AppContext.Provider value={{ d: d!, page: data, years, v, select, selected, projects, go }}>
              {phone ? (
                <Carousel setApi={setApi} opts={{ startIndex: index }} className="pt-5">
                  <CarouselContent className="-ml-4 items-start transition-[height] duration-300" style={{ height }}>
                    {tabs.map((t, i) => (
                      <CarouselItem key={t.key} className="pl-4">
                        <div ref={(el) => void (slides.current[i] = el)}>{panel(t.key)}</div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>
              ) : (
                tabs.map((t) => (
                  <TabsContent key={t.key} value={t.key} className="app-in pt-6">
                    {panel(t.key)}
                  </TabsContent>
                ))
              )}

              {/* 詳細: 広い画面は右に固定して一覧と並べる。それより狭いと Sheet（中間幅は右から、スマホは下から） */}
              {wide ? (
                <aside className={cn('fixed inset-y-0 right-0 z-30 flex w-[440px] bg-background shadow-xl transition-transform duration-300 ease-out', selected ? '' : 'translate-x-full')} aria-label="詳細">
                  <Separator orientation="vertical" />
                  <div className="relative min-w-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
                    {selected ? (
                      <>
                        <Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" onClick={() => select(null)} aria-label="閉じる"><XIcon /></Button>
                        <Detail sel={selected} />
                      </>
                    ) : null}
                  </div>
                </aside>
              ) : (
                <Sheet open={!!selected} onOpenChange={(o) => !o && select(null)}>
                  <SheetContent side={phone ? 'bottom' : 'right'} className={cn('gap-0 overflow-hidden', phone ? 'data-[side=bottom]:h-[92dvh] rounded-t-3xl' : 'w-[440px] sm:max-w-[440px]')}>
                    <SheetTitle className="sr-only">詳細</SheetTitle>
                    {/* 閉じるボタンに focus が移っても中身が下まで送られないよう、送るのは中の箱にする */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5">{selected ? <Detail sel={selected} /> : null}</div>
                  </SheetContent>
                </Sheet>
              )}
            </AppContext.Provider>
          ) : (
            failed ? (
              <p className="pt-6 text-sm text-muted-foreground">データを読み込めませんでした。頁を読み込み直してください。</p>
            ) : (
              <div className="flex flex-col gap-3 pt-6">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-card" />)}</div>
            )
          )}
        </Tabs>
      </div>
      <AskDock name={data.name} sitekey={sitekey} year={year} section={TABS.find((t) => t.key === tab)?.label} />
    </div>
  )
}
