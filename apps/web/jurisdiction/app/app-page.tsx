// 自治体の頁（アプリ型）。ヘッダーの下を「まとめ・事業・決算・予算」のタブにし（決算・予算のタブはどの年度にも出す）、事業・評価シートは一覧と詳細、分野は分野の頁に分ける。
// 一覧は名前と金額だけを出し、説明は詳細にだけ出す。部品は shadcn/ui（Tabs・Carousel・Sheet・Card・Input・ToggleGroup）
import * as React from 'react'
import { useNavigation, useRouter } from '@void/react'
import {
  ArrowSquareOutIcon,
  BankIcon,
  BasketballIcon,
  BriefcaseIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartPieSliceIcon,
  ClipboardTextIcon,
  DotsThreeCircleIcon,
  FileDashedIcon,
  FileTextIcon,
  FirstAidKitIcon,
  GlobeIcon,
  HandHeartIcon,
  HouseLineIcon,
  LeafIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ArrowDownIcon,
  SquaresFourIcon,
  MapTrifoldIcon,
  MapPinAreaIcon,
  StorefrontIcon,
  StudentIcon,
  TreeStructureIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react'
import { MoreDots } from '@/components/more-dots'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { RequestTown } from '../../nav/request-town'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Link } from '../../nav/link'
import { CutIcon, DoneIcon, FixIcon, JoinIcon, KeepIcon, LawIcon, MaybeStopIcon, NewIcon, PlanIcon, SizeIcon, StopIcon, UpIcon } from '../fresh-icons'
import { YearPicker } from '../year-picker'
import { Flow } from '../flow'
import { cofogFlowOf } from '../cofog-flow'
import { COFOG_NAMES } from '@fudoki/fiscal/cofog-master'
import { DOMAIN_FRAMES, OTHER_FRAME, frameOf } from '../domains'
import { pageHead } from '../html'
import { rememberJurisdiction } from '../../home/recent'
import { Hint } from '@/components/hint'
import { AskDock } from '../ask-dock'
import { appPageYears, formatAsOf, formatPeople, reiwa, yearName, type Moku, type PageData, type PageFlow, type Setsu, type YearTotal, TAB_SLUGS, hasDocument, type PageTab } from '../types'
import { directionOf, DIRECTION_ICONS, GRADES, withExtras, yearView, type AccountTotal, type Proj, type Sheet as EvalSheet, type Snapshot, type YearExtras, type YearView } from './data'
import { fieldSubjects, listKey, listPage, projectFull, projectLatest, projectOfId, sheetCountKey, sheetCounts, sheetKey, sheetPage, type ListPage, type ListQuery, type ProjectFull, type ProjRow, type SheetCount, type SheetQuery } from './api'
import { ClientSuspense, FAILED, Resources, type Loaded } from './resource'
import { Amt, yenParts } from './amount'
import { FinanceSections, Tag } from './finance'
import { RevenueSection } from './revenue'
import './app.css'

const FIELD_ICON: Record<string, Icon> = {
  bosai: ShieldCheckIcon, fukushi: HandHeartIcon, kyoiku: StudentIcon, iryo: FirstAidKitIcon, kurashi: HouseLineIcon,
  sangyo: StorefrontIcon, kankyo: LeafIcon, bunka: BasketballIcon, gyosei: BankIcon, other: DotsThreeCircleIcon,
}
const MARK_ICON: Record<string, (p: { className?: string }) => React.ReactNode> = {
  new: NewIcon, up: UpIcon, keep: KeepIcon, law: LawIcon, plan: PlanIcon, fix: FixIcon, size: SizeIcon, cut: CutIcon, done: DoneIcon, join: JoinIcon, stop: StopIcon, maybe: MaybeStopIcon,
}

// ---------- 金額 ----------
const yenText = (y: number) => yenParts(y).join('')
/** 人口の無い自治体は空 */
const perHead = (y: number, pop: number) => {
  if (!pop) return ''
  const v = y / pop
  return v >= 1e4 ? `1人 ${(v / 1e4).toFixed(1)}万円` : `1人 ${Math.round(v).toLocaleString('ja-JP')}円`
}
const r = (y: number) => `R${y - 2018}`

// ---------- 選んだもの（詳細） ----------
type Selected = { kind: 'project'; id: string } | { kind: 'sheet'; id: string; /** 一覧は頁ごとに読むので、選んだシートをそのまま持つ */ sheet: EvalSheet } | { kind: 'moku'; id: string; moku: Moku; phase: 'initial' | 'settlement'; /** 特別会計の目。事業は一般会計の分だけ持つので、中の事業を引かない */ special?: boolean } | null
type Ctx = { d: Snapshot; page: PageData; years: number[]; v: YearView; res: Resources; select: (s: Selected | ((s: Selected) => Selected)) => void; selected: Selected; go: Go; openField: (id: string) => void; /** 予算・決算のタブの頁で loader が読んだ流れ */ flow?: PageFlow; /** 予算・決算のタブの頁なのに流れを読めなかった（API に繋がらなかった） */ flowFailed: boolean; /** 流れの会計を変える（?account= の頁へ移る） */ pickAccount: (account: string) => void; /** loader が defer で渡す流れの節 */ setsu?: Promise<Record<string, Setsu[]>>; /** loader が defer で渡す残り（評価シート・お金のかかる事業）。useFullView が use() で待つ */ extras?: Promise<YearExtras>; prevFieldSubjects?: Record<string, string[]>; /** 年度を移る（タブの見出しの年度の切り替え） */ setYear: (y: number) => void; /** 年度の頁の URL（今のタブのまま） */ yearHref: (y: number) => string }
/** 文脈に添える、開いている事業の評価シートの数の上限（文脈の長さの上限に収める） */
const DETAIL_SOURCES = 3
/** 詳細に開いているものを、アシスタントに渡す文脈の行にする。出典の origin_id と頁・科目の ID を添え、AI が検索し直さずに読めるようにする */
/** 残り（defer）を読み終えていれば足した頁のデータ（描画の外で使う。待たない） */
function withPeekedExtras(d: Snapshot, res: Resources): Snapshot {
  const x = d.pending ? res.peek<Loaded<YearExtras>>(extrasKeyOf(d)) : undefined
  return x && x !== FAILED ? withExtras(d, x) : d
}

function describeSelected(sel: Selected, d: Snapshot, prevFieldSubjects: Record<string, string[]> | undefined, res: Resources): string {
  if (!sel) return ''
  const v = yearView(d, prevFieldSubjects)
  const source = (label: string, x: { fy: number; origin: string; page: number }, name: string) => `${label}: ${r(x.fy)}「${name}」（origin_id ${x.origin}、${x.page}頁）`
  if (sel.kind === 'moku') return `開いている科目: ${[...(sel.moku.path ?? []), sel.moku.name].filter(Boolean).join(' > ')}（subject_id ${sel.moku.id}）`
  if (sel.kind === 'sheet') return source('開いている評価シート', sel.sheet, sel.sheet.name)
  return describeProject(res.peek<Loaded<ProjectFull>>(projectKey(sel.id, v.year, v.kind)), { year: v.year, kind: v.kind })
}

/** 開いている事業を、アシスタントに渡す文脈の行にする。金額は at（無ければ事業が持つ年度と資料）のもの */
function describeProject(p: Loaded<ProjectFull> | undefined, at?: { year: number; kind: string }): string {
  if (!p || p === FAILED) return ''
  const year = at?.year ?? p.year
  const kind = at?.kind ?? p.kind
  const now = year === undefined ? null : ((kind === 'initial' ? p.y[String(year)]?.b : p.y[String(year)]?.s) ?? null)
  const source = (label: string, x: { fy: number; origin: string; page: number }, name: string) => `${label}: ${r(x.fy)}「${name}」（origin_id ${x.origin}、${x.page}頁）`
  return [
    `開いている事業: ${p.name}（${[p.path.filter(Boolean).join(' > '), p.dept].filter(Boolean).join('、')}）${now != null && year !== undefined ? `、${r(year)}の${kind === 'initial' ? '当初予算' : '決算'} ${yenText(now)}` : ''}（project_id ${p.id}）`,
    ...p.sheets.map((s) => source(`この事業の評価シート（${r(s.fy)}に行った事業の評価）`, s, s.name)).slice(0, DETAIL_SOURCES),
  ].join('\n')
}

// 同じ年度でも当初予算と決算で事業の額が違う（予算のタブと事業のタブで資料が違うことがある）ので、資料の種類も鍵に入れる
const projectKey = (id: string, year: number, kind: string) => `project:${id}:${year}:${kind}`

const AppContext = React.createContext<Ctx>(null!)
const useApp = () => React.useContext(AppContext)
const extrasKeyOf = (d: Snapshot) => `extras:${d.code}:${d.year}`

/** 評価シート・お金のかかる事業・新しく始めた事業を足した年度の見方。loader が defer で渡す残りを use() で待つので、Full（ClientSuspense）の中で呼ぶ。
 * 読めなかったら止めずに failed を立てる（画面が「読み込めませんでした」を出す） */
function useFullView(): YearView {
  const { d, v, res, extras, prevFieldSubjects } = useApp()
  const x = d.pending ? React.use(res.get(extrasKeyOf(d), () => extras ?? Promise.reject(new Error('残りが渡されていない')))) : undefined
  // 残りに入っている事業の一覧の1頁目は、一覧の key で置き場に入れる（一覧が読み直さない）
  if (x && x !== FAILED) for (const [k, page] of Object.entries(x.lists)) if (!res.peek(k)) res.set(k, page)
  return React.useMemo(() => (x === undefined ? v : yearView(x === FAILED ? { ...d, failed: true } : withExtras(d, x), prevFieldSubjects)), [x, d, v, prevFieldSubjects])
}
function FullView({ children }: { children: (v: YearView) => React.ReactNode }) {
  return children(useFullView())
}
/** 残り（defer）を待って描く部分。待つあいだと、サーバーの描画・hydration のあいだは fallback */
const Full = ({ fallback, children }: { fallback: React.ReactNode; children: (v: YearView) => React.ReactNode }) => (
  <ClientSuspense fallback={fallback}><FullView>{children}</FullView></ClientSuspense>
)

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
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground [&_svg]:size-3">{children}</span>
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
/** タブの年度の切り替え。広い画面は年度を並べ、狭い画面はメニュー1つ */
function TabYear() {
  const { years, v, setYear, yearHref } = useApp()
  return (
    <div className="shrink-0">
      <div className="md:hidden"><YearMenu years={years} current={v.year} onChange={setYear} /></div>
      <div className="max-md:hidden"><YearPicker years={years} current={v.year} onChange={setYear} hrefOf={yearHref} /></div>
    </div>
  )
}
/** まとめ以外のタブの頭。見出しと、その言葉の意味の一文と、年度の切り替え */
function TabHead({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold leading-snug">{title}</h2>
        <TabYear />
      </div>
      <p className="mt-1.5 text-[15px] leading-[1.7] text-muted-foreground">{children}</p>
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
    <button type="button" onClick={onClick} data-selected={selected || undefined} className="group flex w-full items-center gap-3 px-2.5 py-3 text-left transition-colors hover:bg-card data-selected:bg-accent">
      {rank != null ? <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{rank}</span> : null}
      {icon}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-base leading-normal">{title}</span>
        {sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        <Amt yen={yen} className="text-[17px]" />
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </button>
  )
}
const IconBox = ({ children }: { children: React.ReactNode }) => <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-card text-muted-foreground [&_svg]:size-4">{children}</span>

function SheetRow({ s }: { s: EvalSheet }) {
  const { select, selected } = useApp()
  const dir = directionOf(s)
  return <Row icon={dir ? <Mark kind={dir.icon} label={dir.label} /> : <IconBox><ClipboardTextIcon /></IconBox>} title={s.name} sub={[s.div, dir?.label ?? s.dir].filter(Boolean).join(' · ')} yen={s.s} note={`${r(s.fy)} 決算`} selected={selected?.kind === 'sheet' && selected.id === s.id} onClick={() => select({ kind: 'sheet', id: s.id, sheet: s })} />
}
/** 行の間に Separator を挟む */
/** 最後の節。都道府県・近くの自治体へ。見出しと行はほかの節と同じ形にする */
function Elsewhere() {
  const { page } = useApp()
  // 都道府県の紋章も、近くの自治体と同じく紋章の画像で出す
  const places = [
    ...(page.prefecturePath ? [{ href: page.prefecturePath, name: page.prefecture, icon: page.prefectureLogo ? <img src={page.prefectureLogo} alt="" className="size-full object-contain p-1" /> : <MapTrifoldIcon /> }] : []),
    ...page.neighbors.map((n) => ({ href: n.path, name: n.name, icon: n.logo ? <img src={n.logo} alt="" className="size-full object-contain p-1" /> : <MapPinAreaIcon /> })),
  ]
  return (
    <section>
      <SectionHead title="ほかの自治体を見る" />
      <div className="grid gap-x-6 sm:grid-cols-2">
        {places.map((x) => (
          <Link key={x.href} href={x.href} className="flex items-center gap-3 px-2.5 py-3 text-base text-foreground no-underline transition-colors hover:bg-card">
            <IconBox>{x.icon}</IconBox>
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Rows({ children }: { children: React.ReactNode[] }) {
  return <div className="flex flex-col">{children.map((c, i) => <React.Fragment key={i}>{i ? <Separator /> : null}{c}</React.Fragment>)}</div>
}
const fieldName = (v: YearView, id: string) => v.fields.find((f) => f.id === id)?.name ?? 'その他'

/** 手元に全部ある一覧（評価シート・目）は下まで来たら続きを描く */
function Infinite<T>({ items, render, list, step = 30 }: { items: T[]; render?: (t: T, i: number) => React.ReactNode; /** 行をまとめて描く（表）。無ければ render で1行ずつ描く */ list?: (rows: T[]) => React.ReactNode; step?: number }) {
  const [n, setN] = React.useState(step)
  return (
    <>
      {list ? list(items.slice(0, n)) : <Rows>{items.slice(0, n).map(render!)}</Rows>}
      {items.length > n ? <MoreDots key={n} onVisible={() => setN((x) => x + step)} /> : null}
    </>
  )
}

/** 一覧の1頁目。サーバーが渡した分はそのまま、無ければ API から読む（読み終えるまで Suspense の fallback）。ProjectList と同じ置き場を読む */
function useListPage(q: ListQuery): Loaded<ListPage> {
  const { res } = useApp()
  return React.use(res.get(listKey(q), () => listPage(q)))
}

const RowsSkeleton = ({ n = 5 }: { n?: number }) => (
  <div className="flex flex-col gap-2 py-1" aria-busy="true" aria-label="読み込み中">
    {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
  </div>
)
const LoadFailed = () => <p className="px-2.5 py-4 text-sm text-muted-foreground">読み込めませんでした。少し待ってから開き直してください。</p>

/** 頁ごとに読む一覧。1頁目のあと、末尾が見えたら続きを読んで足す（足した一覧は key の置き場に入れ直す） */
function Paged<T, P extends { rows: T[]; next: string | null }>({ k, first, next, head, render, list }: { k: string; first: () => Promise<P>; next: (token: string) => Promise<P>; head?: (page: P) => React.ReactNode; render?: (t: T, i: number) => React.ReactNode; /** 行をまとめて描く（表）。無ければ render で1行ずつ描く */ list?: (rows: T[]) => React.ReactNode }) {
  const { res } = useApp()
  const page = React.use(res.get(k, first))
  const [tries, bump] = React.useReducer((x: number) => x + 1, 0)
  const loading = React.useRef(false)
  if (page === FAILED) return <LoadFailed />
  const more = () => {
    if (loading.current || !page.next) return
    loading.current = true
    next(page.next).then(
      (p) => {
        res.set(k, { ...page, rows: [...page.rows, ...p.rows], next: p.next })
        loading.current = false
        bump()
      },
      // 読めなければ少し待って末尾の印を置き直す（見えたままなら、もう一度読みに行く）
      () => setTimeout(() => {
        loading.current = false
        bump()
      }, 3000),
    )
  }
  return (
    <>
      {head?.(page)}
      {list ? list(page.rows) : <Rows>{page.rows.map(render!)}</Rows>}
      {page.next ? <MoreDots key={`${page.rows.length}:${tries}`} onVisible={more} /> : null}
    </>
  )
}

/** 事業の一覧（頁ごとに web の /api/projects から読む）。表で出し、末尾が見えたら続きの頁を足す */
function ProjectList({ q, head, render }: { q: ListQuery; head?: (page: ListPage) => React.ReactNode; /** 1行ずつ描く（詳細の中の短い一覧）。無ければ表で出す */ render?: (p: Proj, i: number) => React.ReactNode }) {
  return <Paged k={listKey(q)} first={() => listPage(q)} next={(t) => listPage(q, t)} head={head} render={render} list={render ? undefined : (rows: Proj[]) => <ProjectTable rows={rows} ended={q.filter === 'ended'} />} />
}

const projectFeatures = tableFeatures({})
const projectColumn = createColumnHelper<typeof projectFeatures, Proj & { rank: number }>()

/** 事業の名前の欄。新しく始める・やめた事業の印は事業名の後ろに付け、狭い幅（詳細を横に開いたときも）では分野を下に添える（広い幅は別の列） */
function ProjectNameCell({ p }: { p: Proj }) {
  const { v } = useApp()
  const ended = v.isEnded(p)
  return (
    <span className="block">
      {/* 押せることとフォーカスは事業名のボタンが持つ（行を押しても同じく詳細を開く） */}
      <button type="button" className="rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">{p.name}</button>
      {ended || v.isNew(p) ? <span className="ml-1.5 inline-flex align-middle">{ended ? <Mark kind="stop" label="やめた事業" className="size-5" /> : <Mark kind="new" label="新しく始める事業" className="size-5" />}</span> : null}
      {/* 狭い幅で事業名の下に添える分野は、事業名より控えめな色にする */}
      <span className="block text-muted-foreground @3xl:hidden">{fieldName(v, v.fieldOf(p))}</span>
    </span>
  )
}
function ProjectShareCell({ p }: { p: Proj }) {
  const { v } = useApp()
  // やめた事業の額は前の年度の資料のもの（列の見出しに年度を出す）なので、今の年度の総額に対する割合は出さない
  if (v.isEnded(p)) return null
  return p.yen != null && v.total ? <span className="tabular-nums">{((p.yen / v.total) * 100).toFixed(1)}%</span> : null
}
function ProjectFieldCell({ p }: { p: Proj }) {
  const { v } = useApp()
  return <>{fieldName(v, v.fieldOf(p))}</>
}

/** 事業の表（shadcn の data table）。並びは api が返した金額の多い順のまま。行を押すと詳細を開く。文字は見出しも中身もすべて同じ大きさ・同じ色にする（狭い画面で名前の下に出す分野だけは薄い色） */
function ProjectTable({ rows, ended }: { rows: Proj[]; /** やめた事業は前の年度の額を出す */ ended?: boolean }) {
  const { v, select, selected } = useApp()
  const by = ended ? v.year - 1 : v.year
  const amount = `${r(by)} ${v.label(by)}`
  const columns = React.useMemo(() => projectColumn.columns([
    projectColumn.accessor('rank', { header: () => <span className="sr-only">順位</span>, cell: (c) => c.getValue(), meta: { className: 'w-8 pr-0 text-right tabular-nums' } }),
    projectColumn.display({ id: 'name', header: '事業名', cell: (c) => <ProjectNameCell p={c.row.original} />, meta: { className: 'whitespace-normal' } }),
    projectColumn.display({ id: 'field', header: '分野', cell: (c) => <ProjectFieldCell p={c.row.original} />, meta: { className: '@max-3xl:hidden' } }),
    projectColumn.accessor('yen', { header: () => <span className="inline-flex items-center gap-1">{amount}<ArrowDownIcon className="size-3.5" aria-label="多い順" /></span>, cell: (c) => (c.getValue() == null ? '—' : yenText(c.getValue()!)), meta: { className: 'text-right tabular-nums' } }),
    // やめた事業は割合を出さないので、列ごと出さない
    ...(ended ? [] : [projectColumn.display({ id: 'share', header: '割合', cell: (c) => <ProjectShareCell p={c.row.original} />, meta: { className: '@max-xl:hidden text-right' } })]),
  ]), [amount, ended])
  const data = React.useMemo(() => rows.map((p, i) => ({ ...p, rank: i + 1 })), [rows])
  const table = useTable({ features: projectFeatures, columns, data, getRowId: (p) => p.id })
  const cls = (meta: unknown) => (meta as { className?: string } | undefined)?.className
  return (
    <Table className="text-sm">
      <TableHeader>
        {table.getHeaderGroups().map((g) => (
          <TableRow key={g.id} className="hover:bg-transparent">
            {g.headers.map((h) => (
              <TableHead key={h.id} aria-sort={h.column.id === 'yen' ? 'descending' : undefined} className={cn('h-9 font-normal', cls(h.column.columnDef.meta))}>
                {h.isPlaceholder ? null : <table.FlexRender header={h} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {!rows.length ? (
          <TableRow className="hover:bg-transparent"><TableCell colSpan={columns.length} className="py-6 text-center">当てはまる事業はありません</TableCell></TableRow>
        ) : null}
        {table.getRowModel().rows.map((row) => {
          const on = selected?.kind === 'project' && selected.id === row.original.id
          return (
            <TableRow key={row.id} data-state={on ? 'selected' : undefined} onClick={() => select({ kind: 'project', id: row.original.id })} className="cursor-pointer hover:bg-card data-[state=selected]:bg-accent">
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn('py-2.5', cls(cell.column.columnDef.meta))}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** COFOG のコード（大分類・中分類・小分類）。分野で絞るときは、その分野（大分類）に入るコードを並べて api に渡す */
const COFOG_CODES = Object.values(COFOG_NAMES).flatMap((names) => Object.keys(names))
/** 選んだ分野で絞る条件。分野を選んでいなければ空（絞らない） */
const cofogOf = (fields: string[]): { cofog?: string[] } => {
  const frames = DOMAIN_FRAMES.filter((f) => fields.includes(f.id))
  const cofog = COFOG_CODES.filter((c) => frames.some((f) => frameOf(c) === f))
  return cofog.length ? { cofog } : {}
}

/** 評価シートの一覧の条件（その年度の、分野・事業名で絞ったもの） */
const sheetQueryOf = (d: Pick<Snapshot, 'code'>, v: YearView, fields: string[], q: string): SheetQuery => ({
  code: d.code,
  year: v.year,
  kind: v.kind,
  ...cofogOf(fields),
  ...(q ? { q } : {}),
})

/** 評価シートの区分ごとの数。絞らないときは残り（defer）で届いた数をそのまま使う */
function useSheetCounts(v: YearView, q: SheetQuery): Loaded<SheetCount[]> {
  const { res } = useApp()
  const plain = !q.subjects && !q.cofog && !q.q
  return plain ? v.sheetCounts : React.use(res.get(sheetCountKey(q), () => sheetCounts(q)))
}

/** 分野の頁の A〜D の札（その分野の科目のシートを数える） */
function FieldGradeCards({ q }: { q: SheetQuery }) {
  const { v } = useApp()
  const counts = useSheetCounts(v, q)
  return counts === FAILED ? <LoadFailed /> : <GradeCards counts={counts} />
}

/** 件数（数えるのを打ち切ったら「以上」） */
const countOf = (p: Pick<ListPage, 'total' | 'capped'>) => `${p.total.toLocaleString('ja-JP')}件${p.capped ? '以上' : ''}`

// ---------- 画面 ----------
type TabKey = PageTab
type Go = (t: TabKey, opt?: { filter?: string; field?: string; grade?: string }) => void


/** 分野の行。名前・金額・棒・割合を1行に並べる。割合は前景色で、緑は棒だけに置く */
function FieldRow({ f, i, max, onClick }: { f: YearView['fields'][number]; i: number; max: number; onClick: () => void }) {
  const { v } = useApp()
  const pct = (f.yen / v.total) * 100
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg px-2.5 py-3 text-left transition-colors hover:bg-card sm:grid-cols-[10rem_minmax(0,1fr)_4.5rem]">
      <span className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
        <span className="block truncate text-base font-medium">{f.name}</span>
        <span className="block text-xs text-muted-foreground"><Amt yen={f.yen} /></span>
      </span>
      <span className="col-span-2 col-start-1 row-start-2 block h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:col-start-auto sm:row-start-auto">
        <span className="app-grow block h-full rounded-full bg-primary" style={{ width: `${Math.max(1, (f.yen / max) * 100)}%`, animationDelay: `${i * 30}ms` }} />
      </span>
      <span className="col-start-2 row-start-1 text-right text-[17px] tabular-nums sm:col-start-auto sm:row-start-auto">
        {pct.toFixed(1)}
        <small className="text-xs text-muted-foreground">%</small>
      </span>
    </button>
  )
}

// タブのスワイプは、横に動かせる中身（Carousel・横スクロールの列・表）の上では始めない。始めると中身より先にタブが動く
function startsTabSwipe(api: NonNullable<CarouselApi>, evt: MouseEvent | TouchEvent) {
  const root = api.rootNode()
  for (let el = evt.target instanceof Element ? evt.target : null; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement && el.dataset.slot === 'carousel') return false
    const x = getComputedStyle(el).overflowX
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth) return false
  }
  return true
}

/** A〜D の札。数は api が方向性の区分ごとに数えたもの */
function GradeCards({ counts, value, onChange }: { counts: SheetCount[]; value?: string; onChange?: (g: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {GRADES.map(([g, label]) => (
        <button key={g}
          type="button" aria-pressed={value === g} onClick={() => onChange?.(g)} className="block h-full w-full rounded-xl text-left transition-transform active:scale-[.98]"><Card className={cn('h-full', 'gap-1 bg-background px-3.5 py-3 text-left ring-1 ring-border transition-colors hover:bg-card', value === g && 'bg-accent ring-primary hover:bg-accent')}>
          <span className="flex items-center gap-1.5 text-[15px]">
            <span className="grid size-5 place-items-center rounded-full border border-current text-[11px]">{g}</span>
            {label}
          </span>
          <span className="text-[26px] leading-tight tabular-nums">
            {counts.reduce((n, c) => n + (c.grade === g ? c.n : 0), 0)}
            <small className="ml-1 text-xs text-muted-foreground">事業</small>
          </span>
        </Card></button>
      ))}
    </div>
  )
}

const GENERAL = '一般会計'

function AccountCards({ accounts, account, setAccount }: { accounts: AccountTotal[]; account: string; setAccount: (a: string) => void }) {
  if (accounts.length <= 1) return null
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2" role="radiogroup" aria-label="会計">
      {accounts.map((x) => (
        <button key={x.name} type="button" role="radio" aria-checked={x.name === account} onClick={() => setAccount(x.name)} data-selected={x.name === account || undefined} className="flex min-w-0 flex-col items-start rounded-xl bg-card px-3.5 py-2.5 text-left ring-1 ring-inset ring-transparent transition-colors hover:bg-accent data-selected:bg-accent data-selected:ring-primary">
          <span className="max-w-full text-xs text-muted-foreground [overflow-wrap:anywhere]">{x.name}</span>
          <Amt yen={x.yen} className="text-[17px] text-primary" />
        </button>
      ))}
    </div>
  )
}

/** 予算・決算。事業は下から積み上げる見方、こちらは大きい項目から下りていく見方。当初予算と決算の両方がある年度はタブを分ける */
/** 流れの目に節を足す */
const withSetsu = (flow: PageFlow, byMoku: Record<string, Setsu[]>): PageFlow => {
  const moku = (m: Moku): Moku => ({ ...m, setsu: byMoku[m.id] ?? m.setsu })
  return { ...flow, drills: flow.drills.map((k) => ({ ...k, kou: k.kou.map((o) => ({ ...o, moku: o.moku.map(moku) })) })), loose: flow.loose.map(moku) }
}

function MoneyTab({ phase }: { phase: 'initial' | 'settlement' }) {
  const { v, d, res, page, select, flow, flowFailed, pickAccount, setsu: setsuProp } = useApp()
  const y = d.years[String(v.year)]
  const total: YearTotal | undefined = y?.kind === phase ? { year: v.year, yen: y.total, kan: [] } : undefined
  // 収録はあるが、今の頁のデータが別の資料（スマホで隣のタブを開いた頁など）なら、タブへ移って loader が読むまで待つ
  const recorded = hasDocument(page, v.year, phase)
  const label = phase === 'initial' ? '当初予算' : '決算'
  const tabs = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-base">{reiwa(v.year)}の{label}</span>
    </div>
  )
  // 会計ごとの総額（頁のデータに入っている）。一般会計を先頭に並べ、押した会計の流れを下に出す。押したらすぐ札を選び、流れは移った頁の loader が読む
  const [account, setAccountState] = React.useState(flow?.account ?? GENERAL)
  React.useEffect(() => setAccountState(flow?.account ?? GENERAL), [flow?.account])
  const setAccount = (a: string) => {
    setAccountState(a)
    pickAccount(a)
  }
  const shown = flow && flow.year === v.year && flow.phase === phase && flow.account === account ? flow : undefined
  // 目ごとの節は最初の画面に出さないので、描いた後に読んで流れに足す（読み終えるまで節の無い流れを出す）
  const setsuKey = shown ? `setsu:${d.code}:${shown.year}:${shown.phase}:${shown.account}` : ''
  const [setsu, setSetsu] = React.useState<{ key: string; byMoku: Record<string, Setsu[]> | typeof FAILED }>()
  React.useEffect(() => {
    if (!shown) return
    let live = true
    void res.get(setsuKey, () => setsuProp ?? Promise.reject(new Error('節が渡されていない'))).then((x) => {
      if (live) setSetsu({ key: setsuKey, byMoku: x })
    })
    return () => {
      live = false
    }
  }, [setsuKey, setsuProp])
  const byMoku = setsu?.key === setsuKey ? setsu.byMoku : undefined
  const current = React.useMemo(() => (shown && byMoku && byMoku !== FAILED ? withSetsu(shown, byMoku) : shown), [shown, byMoku])
  // 節を読む前に開いた目の詳細にも、読み終えた節を足す
  React.useEffect(() => {
    if (!byMoku || byMoku === FAILED) return
    select((s) => (s?.kind === 'moku' && s.phase === phase && !s.moku.setsu.length && byMoku[s.id] ? { ...s, moku: { ...s.moku, setsu: byMoku[s.id]! } } : s))
  }, [byMoku])
  const drills = current?.drills
  const flows = current?.drills
  const router = useRouter()
  const accounts = d.accounts ?? []
  // 会計の総額は頁のデータの資料のもの。別の資料のタブ（スマホで隣に並ぶタブ）では使わない
  const special = account === GENERAL || !total ? undefined : accounts.find((x) => x.name === account)
  const picked: YearTotal | undefined = special ? { year: v.year, yen: special.yen, kan: [] } : total
  const summary = picked ? <Amt yen={picked.yen} className="text-[26px] leading-snug text-primary" /> : null
  return (
    <div className="flex flex-col gap-3">
      <TabHead title={label === '決算' ? '決算' : '予算'}>
        {phase === 'settlement'
          ? '決算は、1年間に実際に入ったお金と使ったお金を、年度が終わった後にまとめたものです。議会の認定を受けて確定します。'
          : '予算は、1年間に何にいくら使うかを、年度が始まる前に決めた計画です。議会の議決を経て決まります。このタブでは、年度の初めに決めた当初予算を扱います。'}
      </TabHead>
      {total ? <AccountCards accounts={accounts} account={account} setAccount={setAccount} /> : null}
      {picked ? (
        <Flow key={`${v.year}-${phase}-${account}`} flows={flows} total={picked} onRetry={flowFailed && !drills ? () => void router.refresh({ preserveState: true, preserveScroll: true }) : undefined} tabs={tabs} summary={summary} onMoku={(m) => select({ kind: 'moku', id: m.id, moku: m, phase, special: account !== GENERAL })} bare natural className="scroll-mt-16 @4xl:scroll-mt-16" />
      ) : recorded ? (
        <Skeleton className="h-[480px] rounded-xl" />
      ) : (
        <Empty className="min-h-[320px] border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-11 rounded-full text-muted-foreground [&_svg:not([class*='size-'])]:size-6">
              <FileDashedIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-base">{reiwa(v.year)}の{label}はまだ収録していません</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <RequestTown className="text-sm text-muted-foreground">{label}の収録をリクエストする</RequestTown>
          </EmptyContent>
        </Empty>
      )}
      {byMoku === FAILED ? <p className="text-xs text-muted-foreground">目の内訳（節）を読み込めませんでした。少し待ってから開き直してください。</p> : null}
    </div>
  )
}

function Overview() {
  const { v, page, openField } = useApp()
  return (
    <div className="flex flex-col gap-8">
      {/* ホームのまちの札と同じく、濃い緑の地に総額と1人あたりを載せる。事業の件数は出さない */}
      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
        <p className="text-sm opacity-80">{reiwa(v.year)}の{v.word}（一般会計）</p>
        <Amt yen={v.total} className="mt-1 block text-[40px] leading-none font-semibold sm:text-[48px]" />
        {v.perHead != null ? (
          <p className="mt-2 text-sm opacity-80">
            1人あたり <Amt yen={v.perHead} />
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">
            何に使う？<span className="ml-1.5 text-[13px] font-normal text-muted-foreground">歳出</span>
            <Amt yen={v.total} className="ml-2 font-medium text-primary" />
          </h2>
          <Tag>{r(v.year)} {v.word === '決算' ? '決算' : '当初予算'}</Tag>
        </div>
        <p className="-mt-1 mb-2.5 text-[15px] leading-[1.7] text-muted-foreground">
          {v.word === '決算'
            ? '歳出は、自治体が1年間に使ったお金です。ここでは、税金を主な財源にする基本の会計（一般会計）の決算を、使い道の分野ごとに分けています。'
            : '歳出は、自治体が1年間に使う予定のお金です。ここでは、税金を主な財源にする基本の会計（一般会計）の当初予算を、使い道の分野ごとに分けています。'}
        </p>
        {/* 棒の長さは一番大きい分野を満たんにし、割合の数字は合計に対する比のまま出す */}
        <div className="grid gap-x-8 @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-(--rows)" style={{ '--rows': `repeat(${Math.ceil(v.fields.length / 2)}, auto)` } as React.CSSProperties}>
          {v.fields.map((f, i) => <FieldRow key={f.id} f={f} i={i} max={Math.max(...v.fields.map((x) => x.yen))} onClick={() => openField(f.id)} />)}
        </div>
      </section>

      {/* 一般会計の歳入（api の get_revenue を loader が頁のデータに入れる）。歳入の無い年度は節ごと出さない */}
      <RevenueSection revenue={page.revenue} year={v.year} kind={v.kind} prefecture={page.prefecture} />

      {/* 借金と貯金・事業に回ったお金・財政の指標（総務省の決算状況調。web の D1 から loader が頁のデータに入れる） */}
      <FinanceSections finance={page.finance} year={v.year} people={page.population?.people ?? null} />
      <Elsewhere />
    </div>
  )
}

const KINDS = [
  { id: 'new', label: '新しく始める', icon: <NewIcon className="size-4 text-primary" /> },
  { id: 'ended', label: 'やめた', icon: <StopIcon className="size-4 text-primary" /> },
  { id: 'eval', label: '評価した', icon: <ClipboardTextIcon className="size-4" /> },
] as const
// 絞り込みのボタン（Apple の pop-up / pull-down button と同じく、押すとメニューが開き、今の値をボタンに出す）。絞っている間は緑地にする
const filterTrigger = (on: boolean) => cn('inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-card')
/** 事業の区分（新しく始める・やめた）。1つだけ選ぶ（引く年度の資料が違うので重ねられない）。既定は「すべての事業」。
 * 評価した事業はメニューに出さず、事業評価の札から開く（開いている間はボタンに「評価した」と出す） */
function KindMenu({ v, filter, setFilter }: { v: YearView; filter: string; setFilter: (f: string) => void }) {
  const shown = KINDS.filter((k) => k.id !== 'eval' && v.comparable)
  // 一覧の読み直しは transition で遅れて届くので、選んだ状態は手元に持ってすぐ出す
  const [value, setValue] = React.useState(filter)
  React.useEffect(() => setValue(filter), [filter])
  if (!shown.length && value !== 'eval') return null
  const picked = KINDS.find((k) => k.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="事業の区分で絞る" className={filterTrigger(!!picked)}>
        <span className="min-w-0 truncate">{picked?.label ?? 'すべての事業'}</span>
        <CaretDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        <DropdownMenuRadioGroup value={value} onValueChange={(x) => { setValue(x as string); setFilter(x as string) }}>
          <DropdownMenuRadioItem value="all" closeOnClick>すべての事業</DropdownMenuRadioItem>
          {shown.map((k) => <DropdownMenuRadioItem key={k.id} value={k.id} closeOnClick>{k.icon}{k.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
/** 分野（COFOG の大分類）。いくつでも選べ、メニューは開いたまま続けて選べる。先頭の「すべての分野」で全部外す。
 * COFOG の付かない科目（その他）は COFOG のコードでは絞れないので出さない */
function FieldMenu({ v, fields, setFields }: { v: YearView; fields: string[]; setFields: (f: string[]) => void }) {
  // 続けて押しても前の選択を落とさないよう、選んだ状態は手元に持つ
  const choices = v.fields.filter((f) => f.id !== OTHER_FRAME.id)
  const [value, setValue] = React.useState(fields)
  React.useEffect(() => setValue(fields), [fields.join()])
  const set = (next: string[]) => {
    // 並びは分野の並び（金額の多い順）に揃える
    const ordered = choices.map((f) => f.id).filter((id) => next.includes(id))
    setValue(ordered)
    setFields(ordered)
  }
  const label = !value.length ? 'すべての分野' : value.length === 1 ? fieldName(v, value[0]!) : `${fieldName(v, value[0]!)} ほか${value.length - 1}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="分野で絞る" className={filterTrigger(value.length > 0)}>
        <span className="min-w-0 truncate">{label}</span>
        <CaretDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        <DropdownMenuCheckboxItem checked={!value.length} onCheckedChange={() => set([])}>すべての分野</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {choices.map((f) => (
          <DropdownMenuCheckboxItem key={f.id} checked={value.includes(f.id)} onCheckedChange={(on) => set(on ? [...value, f.id] : value.filter((x) => x !== f.id))}>
            <FieldIcon id={f.id} />{f.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectsTab({ filter, setFilter, fields, setFields, grade, setGrade }: { filter: string; setFilter: (f: string) => void; /** 選んだ分野（空はすべて） */ fields: string[]; setFields: (f: string[]) => void; grade: string; setGrade: (g: string) => void }) {
  const { v, res } = useApp()
  // 入力は少し待ってから絞る（打つたびに API を呼ばない）。待つあいだと読むあいだは前の一覧を出したまま
  const [text, setText] = React.useState('')
  const [q, setQ] = React.useState('')
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const onText = (t: string) => {
    setText(t)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => React.startTransition(() => setQ(t.trim())), 300)
  }
  const head = (n: string) => (
    <p className="px-2.5 text-xs text-muted-foreground">
      {filter === 'new' ? '予算書で新しく現れた事業・' : ''}
      {n}
    </p>
  )
  const body = (v: YearView) => {
    const list = filter === 'eval' ? null : v.query(filter as ListQuery['filter'], { ...cofogOf(fields), ...(q ? { q } : {}) })
    // 事業の収録の無い自治体は、目を事業の代わりに並べる（手元に全部ある）
    const moku = v.hasProjects !== false ? [] : v.mokuRows.filter((p) => (!fields.length || fields.includes(v.fieldOf(p))) && (!q || p.name.includes(q)))
    return !v.hasProjects ? (
      // 目には始めた年度が無いので、新しく始める・やめた事業は出さない
      filter === 'all' ? (
        <>
          {head(`${moku.length}件`)}
          <Infinite items={moku} list={(rows) => <ProjectTable rows={rows} />} />
        </>
      ) : null
    ) : list ? (
      <ClientSuspense fallback={<RowsSkeleton />} ready={!!res.peek(listKey(list))}>
        <ProjectList q={list} head={(page) => head(countOf(page))} />
      </ClientSuspense>
    ) : null
  }
  // 事業評価の札。絞り込みの無い「すべて」のときだけ一覧の上に出す（残りの defer が届いてから）
  const lead = filter === 'all' && !q && !fields.length ? (
    <Full fallback={null}>
      {(v) => (
        <div className="mb-6 flex flex-col gap-8 empty:hidden">
          {v.sheetTotal ? (
            <section>
              <SectionHead title="事業評価" sub={`${r(v.year)}年度の事業`}><MoreLink onClick={() => setFilter('eval')} /></SectionHead>
              <GradeCards counts={v.sheetCounts} onChange={(g) => (setGrade(g), setFilter('eval'))} />
            </section>
          ) : null}
        </div>
      )}
    </Full>
  ) : null
  return (
    <div className="flex flex-col gap-2">
      <TabHead title="事業">事業は、自治体がお金を使って行う一つ一つの仕事です。</TabHead>
      {lead}
      {/* 検索の行と、絞り込み（事業の区分・分野の combobox）の行を分ける */}
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={text} onChange={(e) => onText(e.target.value)} placeholder="事業名・担当の課で探す" className="h-9 rounded-full pl-9" aria-label="事業を探す" />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {/* 新しく始める・やめた・評価したは残り（defer）が届いてから選べるようにする */}
        <Full fallback={null}>{(v) => <KindMenu v={v} filter={filter} setFilter={setFilter} />}</Full>
        <FieldMenu v={v} fields={fields} setFields={setFields} />
      </div>
      {filter === 'eval' ? (
        <Full fallback={<RowsSkeleton />}>{(v) => <EvalList v={v} grade={grade} setGrade={setGrade} fields={fields} q={q} leave={() => setFilter('all')} />}</Full>
      ) : <>
      {/* 事業の収録があるかは、事業のタブの頁なら loader が渡し、他のタブの頁（スマホで横に並ぶ事業のタブ）では残り（defer）で届く */}
      {v.hasProjects === undefined ? <Full fallback={<RowsSkeleton />}>{(v) => (v.failed && v.hasProjects === undefined ? <LoadFailed /> : body(v))}</Full> : body(v)}
      </>}
    </div>
  )
}

/** 事業の一覧の「評価した」。評価は事業の属性なので、別のタブにせず事業の絞り込みの1つにする。
 * A〜D の札は api が数えた数、シートは選んだ札の区分だけを頁ごとに読む */
function EvalList({ v, grade, setGrade, fields, q, leave }: { v: YearView; grade: string; setGrade: (g: string) => void; fields: string[]; q: string; /** 評価の無い年度へ移ったら絞り込みを戻す */ leave: () => void }) {
  const { d } = useApp()
  React.useEffect(() => {
    if (!v.failed && !v.sheetTotal) leave()
  }, [v])
  // 評価シートを読めなかったら、0件と見せずに読めなかったと出す
  if (v.failed) return <LoadFailed />
  const base = sheetQueryOf(d, v, fields, q.trim())
  return (
    <div className="mt-1 flex flex-col gap-3">
      <ClientSuspense fallback={<RowsSkeleton />} ready={!base.cofog && !base.q}>
        <EvalBody v={v} base={base} grade={grade} setGrade={setGrade} />
      </ClientSuspense>
      <p className="text-xs text-muted-foreground">自治体が {r(v.year)}年度に行った事業を自ら評価した結果です。A〜D と方向性は、自治体ごとに違う評価の書き方を共通の区分に揃えたもので、風土記は評価を加えていません。</p>
    </div>
  )
}

function EvalBody({ v, base, grade, setGrade }: { v: YearView; base: SheetQuery; grade: string; setGrade: (g: string) => void }) {
  const { res } = useApp()
  const counts = useSheetCounts(v, base)
  if (counts === FAILED) return <LoadFailed />
  // 札の区分（数えた中で、その札に入る方向性）だけでシートを引く
  const dirs = counts.filter((c): c is SheetCount & { code: NonNullable<SheetCount['code']> } => c.grade === grade && !!c.code).sort((a, b) => Object.keys(DIRECTION_ICONS).indexOf(a.code) - Object.keys(DIRECTION_ICONS).indexOf(b.code))
  const list: SheetQuery = { ...base, codes: dirs.map((c) => c.code) }
  return (
    <>
      <GradeCards counts={counts} value={grade} onChange={setGrade} />
      <div className="flex flex-wrap gap-1.5">
        {dirs.map((c) => (
          <span key={c.code} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"><Mark kind={DIRECTION_ICONS[c.code]} className="size-[18px]" />{c.label} {c.n}</span>
        ))}
      </div>
      <ClientSuspense fallback={<RowsSkeleton />} ready={!!res.peek(sheetKey(list))}>
        <Paged k={sheetKey(list)} first={() => sheetPage(list)} next={(t) => sheetPage(list, t)} render={(s: EvalSheet) => <SheetRow key={s.id} s={s} />} />
      </ClientSuspense>
    </>
  )
}

// ---------- 詳細 ----------
function DetailSection({ icon: I, title, count, children }: { icon: Icon; title: string; count?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><I className="size-4 text-muted-foreground" aria-hidden="true" />{title}{count != null ? <span className="font-normal text-muted-foreground">{count}</span> : null}</h3>
      {children}
    </section>
  )
}
const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">{children}<ArrowSquareOutIcon className="size-3" aria-hidden="true" /></a>
)

/** 事業の詳細。開いたときに公開 API から事業（年度ごとの額）と中の事業を読む。目を事業の代わりにした自治体は手元の目の行から作る */
function ProjectDetail({ id }: { id: string }) {
  const { v, res } = useApp()
  if (id.startsWith('moku:')) {
    const m = v.mokuRows.find((x) => x.id === id)
    if (!m) return null
    const yen = { b: v.kind === 'initial' ? m.yen : null, s: v.kind === 'initial' ? null : m.yen }
    return <ProjectBody p={{ id, name: m.name, dept: null, path: m.path, started: null, ended: null, y: { [String(v.year)]: yen }, kids: [], subject: m.subject, sheets: [] }} />
  }
  const loaded = React.use(res.get(projectKey(id, v.year, v.kind), () => projectFull(id, v.year, v.kind)))
  return loaded === FAILED ? <LoadFailed /> : <ProjectBody p={loaded} />
}

/** 事業の名前。新しく始める・やめた事業の印は名前の後ろに付ける */
function ProjectTitle({ p, mark }: { p: Pick<ProjectFull, 'name'>; mark: 'new' | 'stop' | null }) {
  return (
    <>
      <h2 className="mb-2 flex items-start gap-1.5 text-xl font-semibold leading-snug">
        {p.name}
        {mark === 'stop' ? <Mark kind="stop" label="やめた事業" /> : mark === 'new' ? <Mark kind="new" label="新しく始める事業" /> : null}
      </h2>
    </>
  )
}

const projectLatestKey = (id: string) => `project-latest:${id}`

/** 事業の頁（/tokyo/shinagawa/projects/<project_id>）。一覧の行・評価シート・分野の頁の事業から開く。事業は年度をまたぐので年度の段を持たず、
 * 金額は年度ごとの表で出す（大きな金額は出さない）。内訳（中の事業）・評価シートは事業の最新の年度（決算があれば決算）のもの */
function ProjectPage({ id }: { id: string }) {
  return (
    <ClientSuspense fallback={<RowsSkeleton n={4} />}>
      <ProjectPageBody id={id} />
    </ClientSuspense>
  )
}

function ProjectPageBody({ id }: { id: string }) {
  const { res, select, v: pageView } = useApp()
  const p = React.use(res.get(projectLatestKey(id), () => projectLatest(id)))
  if (p === FAILED || p.year === undefined || !p.kind) return <LoadFailed />
  const year = p.year
  const label = p.kind === 'initial' ? '当初予算' : '決算'
  const frame = (p.cofog ? frameOf(p.cofog) : undefined) ?? OTHER_FRAME
  const rows = Object.keys(p.y).map(Number).sort((a, b) => b - a)
  return (
    <>
      <ProjectTitle p={p} mark={p.ended != null ? 'stop' : p.started === year ? 'new' : null} />
      <div className="flex flex-wrap gap-1.5">
        <Chip><FieldIcon id={frame.id} />{frame.name}</Chip>
      </div>
      <DetailSection icon={CalendarBlankIcon} title="年度ごと">
        <div className="grid max-w-xl grid-cols-[auto_1fr_1fr] text-[15px]">
          <span className="py-1.5 text-xs" /><span className="py-1.5 text-right text-xs text-muted-foreground">当初予算</span><span className="px-1 py-1.5 text-right text-xs text-muted-foreground">決算</span>
          {rows.map((y) => (
            <div key={y} className={cn('col-span-full grid grid-cols-subgrid', y === year && 'bg-card')}>
              <Separator className="col-span-full" />
              <span className="px-1 py-2">{r(y)}</span>
              <span className="py-2 text-right"><Amt yen={p.y[String(y)]?.b} className="text-[15px]" /></span>
              <span className="px-1 py-2 text-right"><Amt yen={p.y[String(y)]?.s} className="text-[15px]" /></span>
            </div>
          ))}
        </div>
      </DetailSection>
      {p.sheets.length ? (
        <DetailSection icon={ClipboardTextIcon} title="事業評価" count={`${p.sheets.length}件`}>
          <div className="grid gap-2 @3xl:grid-cols-2">
            {p.sheets.map((s) => {
              const dir = directionOf(s)
              return (
                <button key={s.id} type="button" onClick={() => select({ kind: 'sheet', id: s.id, sheet: s })} className="flex w-full items-start gap-2.5 rounded-xl bg-card p-3 text-left hover:bg-secondary">
                  {dir ? <Mark kind={dir.icon} /> : null}
                  <span><span className="block text-[15px] font-semibold">{s.name}</span><span className="text-xs text-muted-foreground">{[`${r(s.fy)}年度の事業`, s.grade ? `評価 ${s.grade} ${GRADES.find((g) => g[0] === s.grade)?.[1] ?? ''}` : null, dir?.label ?? s.dir].filter(Boolean).join(' · ')}</span></span>
                </button>
              )
            })}
          </div>
        </DetailSection>
      ) : null}
      {p.kids.length ? (
        <DetailSection icon={TreeStructureIcon} title="内訳" count={`${r(year)}年度の${label} · ${p.kids.length}件`}>
          <Infinite items={p.kids} step={10} render={({ name, yen }, i) => (
            <div key={i} className="flex items-center gap-3 px-1.5 py-2 text-[15px]"><span className="flex-1">{name}</span><Amt yen={yen} className="text-base" /></div>
          )} />
        </DetailSection>
      ) : null}
      {/* 出典の資料は頁の年度のもの。事業の年度と同じときだけ添える */}
      {pageView.year === year && pageView.kind === p.kind && pageView.origin ? <DetailSection icon={FileTextIcon} title="出典"><Ext href={pageView.origin}>{pageView.originTitle ?? '予算書'}</Ext></DetailSection> : null}
    </>
  )
}

function ProjectBody({ p }: { p: ProjectFull }) {
  const { d, select, years } = useApp()
  // 新しく始めた・やめたの印は残り（defer）の事業の収録で決まるので待つ（ProjectDetail は ClientSuspense の中）
  const v = useFullView()
  const ys = String(v.year)
  const amt = (y: string) => (d.kinds[y] === 'settlement' ? p.y[y]?.s : p.y[y]?.b) ?? null
  const now = amt(ys)
  const prev = amt(String(v.year - 1))
  const ss = p.sheets
  const kids = p.kids
  const ended = v.isEnded(p)
  const field = v.fieldOf(p)
  return (
    <>
      <ProjectTitle p={p} mark={ended ? 'stop' : v.isNew(p) ? 'new' : null} />
      <div className="flex flex-wrap gap-1.5">
        <Chip><FieldIcon id={field} />{fieldName(v, field)}</Chip>
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
            {now != null ? <span className="text-xs text-muted-foreground">{[perHead(now, d.pop), prev ? `${r(v.year - 1)}年度から ${now >= prev ? '+' : '−'}${yenText(Math.abs(now - prev))}` : ''].filter(Boolean).join(' · ')}</span> : <span className="text-xs text-muted-foreground">当初予算には載っていません{p.y[ys]?.s != null ? `（決算 ${yenText(p.y[ys]!.s!)}）` : ''}</span>}
          </>
        )}
      </div>
      <DetailSection icon={CalendarBlankIcon} title="年度ごと">
        <div className="grid grid-cols-[auto_1fr_1fr] text-[15px]">
          <span className="py-1.5 text-xs" /><span className="py-1.5 text-right text-xs text-muted-foreground">当初予算</span><span className="px-1 py-1.5 text-right text-xs text-muted-foreground">決算</span>
          {years.map((y) => (
            <div key={y} className={cn('col-span-full grid grid-cols-subgrid', y === v.year && 'bg-card')}>
              <Separator className="col-span-full" />
              <span className="px-1 py-2">{r(y)}</span>
              <span className="py-2 text-right"><Amt yen={p.y[y]?.b} className="text-[15px]" /></span>
              <span className="px-1 py-2 text-right"><Amt yen={p.y[y]?.s} className="text-[15px]" /></span>
            </div>
          ))}
        </div>
      </DetailSection>
      {ss.length ? (
        <DetailSection icon={ClipboardTextIcon} title="事業評価" count={`${r(v.year)}年度の事業`}>
          {ss.map((s) => {
            const dir = directionOf(s)
            return (
              <button key={s.id} type="button" onClick={() => select({ kind: 'sheet', id: s.id, sheet: s })} className="mb-2 flex w-full items-start gap-2.5 rounded-xl bg-card p-3 text-left hover:bg-secondary">
                {dir ? <Mark kind={dir.icon} /> : null}
                <span><span className="block text-[15px] font-semibold">{s.name}</span><span className="text-xs text-muted-foreground">{[s.grade ? `評価 ${s.grade} ${GRADES.find((g) => g[0] === s.grade)?.[1] ?? ''}` : null, dir?.label ?? s.dir].filter(Boolean).join(' · ')}</span></span>
              </button>
            )
          })}
        </DetailSection>
      ) : null}
      {kids.length ? (
        <DetailSection icon={TreeStructureIcon} title="内訳" count={kids.length}>
          <Infinite items={kids} step={10} render={({ name, yen }, i) => (
            <div key={i} className="flex items-center gap-3 px-1.5 py-2 text-[15px]"><span className="flex-1">{name}</span><Amt yen={yen} className="text-base" /></div>
          )} />
        </DetailSection>
      ) : null}
      {v.origin ? <DetailSection icon={FileTextIcon} title="出典"><Ext href={v.origin}>{v.originTitle ?? '予算書'}</Ext></DetailSection> : null}
    </>
  )
}

function SheetDetail({ s }: { s: EvalSheet }) {
  const dir = directionOf(s)
  return (
    <>
      <p className="text-xs text-muted-foreground">{s.acct} · {s.div}</p>
      <h2 className="mt-1.5 text-xl font-semibold leading-snug">{s.name}</h2>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Card className="gap-1 bg-accent px-3.5 py-3 ring-1 ring-primary">
          <span className="flex items-center gap-1.5 text-[15px]">{s.grade ? <span className="grid size-5 place-items-center rounded-full border border-current text-[11px]">{s.grade}</span> : null}評価</span>
          <span className="text-lg">{GRADES.find((g) => g[0] === s.grade)?.[1] ?? '—'}</span>
        </Card>
        <Card className="gap-1 bg-background px-3.5 py-3 ring-1 ring-border">
          <span className="flex items-center gap-1.5 text-[15px]">{dir ? <Mark kind={dir.icon} className="size-5" /> : null}今後の方向</span>
          <span className="text-base">{dir?.label ?? s.dir ?? '—'}</span>
        </Card>
      </div>
      <DetailSection icon={CalendarBlankIcon} title={`${r(s.fy)}年度の事業`}>
        <div className="flex gap-8 text-[15px]"><span>予算 <Amt yen={s.b} className="text-[15px]" /></span><span>決算 <Amt yen={s.s} className="text-[15px]" /></span></div>
      </DetailSection>
      {s.projects.length ? (
        <ClientSuspense fallback={null}>
          <SheetProjects ids={s.projects} year={s.fy} />
        </ClientSuspense>
      ) : null}
      <DetailSection icon={FileTextIcon} title="出典"><Ext href={`${s.url}#page=${s.page}`}>評価シート（{s.page}頁）</Ext></DetailSection>
      <p className="mt-3 text-xs text-muted-foreground">評価は自治体が自ら付けたものです。A〜D と方向性は書き方を共通の区分に揃えたもので、風土記は評価を加えていません。</p>
    </>
  )
}

/** 評価シートをつないだ予算書の事業（所管課ごとに複数のことがある）。開いたときに公開 API から引く */
function SheetProjects({ ids, year }: { ids: string[]; year: number }) {
  const { res } = useApp()
  const rows = React.use(res.get(`sheet-projects:${year}:${ids.join(',')}`, () => Promise.all(ids.map((id) => projectOfId(id, year, 'settlement')))))
  const found = rows === FAILED ? [] : rows.filter((p): p is ProjRow => !!p)
  if (!found.length) return null
  return (
    <DetailSection icon={BriefcaseIcon} title="予算書の事業">
      <div className="flex flex-col gap-2">{found.map((p) => <ProjectButton key={p.id} p={p} />)}</div>
    </DetailSection>
  )
}

function ProjectButton({ p }: { p: ProjRow }) {
  const { select } = useApp()
  return (
    <button type="button" onClick={() => select({ kind: 'project', id: p.id })} className="flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left hover:bg-secondary">
      <span className="flex-1"><span className="block text-[15px] font-semibold">{p.name}</span><span className="text-xs text-muted-foreground">{p.dept}</span></span>
    </button>
  )
}

/** 分野の頁（/tokyo/shinagawa/2026/fields/fukushi）。まとめのタイルから開く */
const loadFieldChart = () => import('./field-chart')
const FieldChart = React.lazy(loadFieldChart)
/** 内訳の色。緑の濃さを金額の順に下げる（色に意味は持たせない）。その他は灰色。ink は切れの上に書く割合の文字色 */
// oxlint-disable-next-line design/color-literal -- 既存のずれ。直すか例外にするか決めるまで
const SLICE_COLORS = [100, 78, 60, 44, 30].map((n) => `color-mix(in oklab, var(--primary) ${n}%, var(--background))`)
const SLICE_INKS = ['var(--primary-foreground)', 'var(--primary-foreground)', 'var(--primary-foreground)', 'var(--foreground)', 'var(--foreground)']
// oxlint-disable-next-line design/color-literal -- 既存のずれ。直すか例外にするか決めるまで
const REST_COLOR = 'color-mix(in oklab, var(--muted-foreground) 22%, var(--background))'

/** 分野の内訳: COFOG の中分類ごとの金額。多い順に5つと、残りはまとめる */
function FieldBreakdown({ frame }: { frame: { cofog: string } }) {
  return (
    <ClientSuspense fallback={<DetailSection icon={ChartPieSliceIcon} title="内訳"><Skeleton className="h-[320px] rounded-xl @2xl:h-[420px]" /></DetailSection>}>
      <FieldSlices frame={frame} />
    </ClientSuspense>
  )
}

function FieldSlices({ frame }: { frame: { cofog: string } }) {
  const { v, d } = useApp()
  // 中分類は開いた年度の目の COFOG のコードから組む（予算・決算のタブの分野の図と同じ分け方）
  const drills = React.useMemo(() => {
    const y = d.years[String(v.year)]
    const moku = [...(y?.kan ?? []).flatMap((k) => k.kou.flatMap((o) => o.moku)), ...(y?.looseMoku ?? [])]
    return cofogFlowOf(moku.map((m) => ({ id: m.id, name: m.name, yen: m.yen, setsu: [], cofog: m.cofog })), false)
  }, [d, v.year])
  const slices = React.useMemo(() => {
    const drill = drills.find((x) => x.kan.id === `cofog-${frame.cofog || 'none'}`)
    const rows = (drill?.kou ?? []).filter((k) => !k.amountMissing && k.yen > 0).sort((a, b) => Number(!a.id.includes('.')) - Number(!b.id.includes('.')) || b.yen - a.yen)
    const many = rows.length > SLICE_COLORS.length + 1
    const top = (many ? rows.slice(0, SLICE_COLORS.length) : rows.slice(0, SLICE_COLORS.length + 1)).map((k, i) => ({ key: k.id, name: k.name, yen: k.yen, color: SLICE_COLORS[i] ?? REST_COLOR, ink: SLICE_INKS[i] ?? 'var(--foreground)' }))
    const rest = rows.slice(top.length).reduce((t, k) => t + k.yen, 0)
    return rest > 0 ? [...top, { key: 'rest', name: `ほか${rows.length - top.length}件`, yen: rest, color: REST_COLOR, ink: 'var(--foreground)' }] : top
  }, [drills, frame.cofog])
  if (!slices.length) return null
  return (
    <DetailSection icon={ChartPieSliceIcon} title="内訳">
      <React.Suspense fallback={<Skeleton className="h-[320px] rounded-xl @2xl:h-[420px]" />}>
        <FieldChart slices={slices} format={yenText} />
      </React.Suspense>
    </DetailSection>
  )
}

function FieldPage({ id }: { id: string }) {
  const { v, d, res } = useApp()
  const f = v.fields.find((x) => x.id === id)
  if (!f) return <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{reiwa(v.year)}にはこの分野の予算がありません。</p><TabYear /></div>
  return (
    <>
      <div>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-card text-muted-foreground"><FieldIcon id={f.id} className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold leading-snug">{f.name}</h2>
          <p className="text-xs text-muted-foreground">{f.examples}</p>
        </div>
        {/* 分野の頁は同じ分野のまま年度を移れる（yearHref が分野の段を残す） */}
        <TabYear />
      </div>
      <div className="mt-5">
        <span className="text-xs text-muted-foreground">{reiwa(v.year)}の{v.word}</span>
        <Amt yen={f.yen} className="block text-4xl leading-tight text-primary" />
        <span className="text-xs text-muted-foreground">{[`全体の ${((f.yen / v.total) * 100).toFixed(1)}%`, perHead(f.yen, d.pop)].filter(Boolean).join(' · ')}</span>
      </div>
      </div>
      <FieldBreakdown frame={[...DOMAIN_FRAMES, OTHER_FRAME].find((x) => x.id === f.id) ?? OTHER_FRAME} />
      {/* 事業の収録があるかは、事業のタブの頁なら loader が渡し、それ以外は残り（defer）で届く */}
      {v.hasProjects === undefined ? (
        <Full fallback={<DetailSection icon={ListBulletsIcon} title="事業"><RowsSkeleton /></DetailSection>}>
          {(v) => (v.failed ? <DetailSection icon={ListBulletsIcon} title="事業"><LoadFailed /></DetailSection> : <FieldProjectsOf v={v} id={f.id} />)}
        </Full>
      ) : (
        <FieldProjectsOf v={v} id={f.id} />
      )}
      <Full fallback={null}>
        {(v) => v.sheetTotal ? (
          <DetailSection icon={ClipboardTextIcon} title="事業評価" count={`${r(v.year)}年度の事業`}>
            <ClientSuspense fallback={<Skeleton className="h-20 rounded-xl" />}>
              <FieldGradeCards q={{ code: d.code, year: v.year, kind: v.kind, subjects: v.subjectsOf(f.id) }} />
            </ClientSuspense>
          </DetailSection>
        ) : null}
      </Full>
      <p className="mt-6 text-xs text-muted-foreground">分野は COFOG（政府支出の機能別分類）の大分類です。風土記が独自で区別しています。</p>
    </>
  )
}

/** 分野の事業。事業の収録の無い自治体は、目を事業の代わりに並べる（手元に全部ある） */
function FieldProjectsOf({ v, id }: { v: YearView; id: string }) {
  const { res } = useApp()
  if (v.hasProjects) {
    return (
      <ClientSuspense fallback={<DetailSection icon={ListBulletsIcon} title="事業"><RowsSkeleton /></DetailSection>} ready={!!res.peek(listKey(v.query('all', { subjects: v.subjectsOf(id) })))}>
        <FieldProjects id={id} />
      </ClientSuspense>
    )
  }
  const rows = v.mokuRows.filter((p) => v.fieldOf(p) === id)
  return (
    <DetailSection icon={ListBulletsIcon} title="事業" count={`${rows.length}件`}>
      <Infinite items={rows} list={(rows) => <ProjectTable rows={rows} />} />
    </DetailSection>
  )
}

/** 分野の事業。分野の末端の科目の ID で事業の年度を絞る（科目を1回、事業を1回読むだけ） */
function FieldProjects({ id }: { id: string }) {
  const { v } = useApp()
  const q = v.query('all', { subjects: v.subjectsOf(id) })
  const page = useListPage(q)
  return (
    <DetailSection icon={ListBulletsIcon} title="事業" count={page === FAILED ? undefined : countOf(page)}>
      <ProjectList q={q} />
    </DetailSection>
  )
}

/** 予算タブの図で押した目。事業の詳細と同じ形で、目の金額・中の事業・節を出す */
function MokuDetail({ moku, phase, special }: { moku: Moku; phase: 'initial' | 'settlement'; special?: boolean }) {
  const { v, d } = useApp()
  const setsu = moku.setsu.filter((s) => s.amountMissing || s.yen > 0)
  const base = moku.amountMissing ? Math.max(0, ...setsu.map((s) => s.yen)) : moku.yen
  return (
    <>
      {moku.path ? <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{moku.path.filter(Boolean).map((x, i) => <React.Fragment key={i}>{i ? <CaretRightIcon className="size-2.5" /> : null}{x}</React.Fragment>)}</p> : null}
      <h2 className="mt-1.5 mb-2 text-xl font-semibold leading-snug">{moku.name}</h2>
      <div className="mt-5">
        <span className="text-xs text-muted-foreground">{reiwa(v.year)}の{phase === 'initial' ? '当初予算' : '決算'}</span>
        {moku.amountMissing ? <span className="block text-2xl leading-tight text-muted-foreground">金額未記載</span> : <Amt yen={moku.yen} className="block text-4xl leading-tight text-primary" />}
        {!moku.amountMissing && perHead(moku.yen, d.pop) ? <span className="text-xs text-muted-foreground">{perHead(moku.yen, d.pop)}</span> : null}
      </div>
      {/* 事業は一般会計の分だけ持つので、特別会計の目では引かない */}
      {!special && /^[0-9a-f]{64}$/.test(moku.id) ? (
        // 事業の収録があるかは、予算・決算のタブでは残り（defer）で届く
        <Full fallback={null}>
          {(v) => v.hasProjects ? (
            <ClientSuspense fallback={<DetailSection icon={BriefcaseIcon} title="中の事業"><RowsSkeleton n={3} /></DetailSection>}>
              <MokuProjects subject={moku.id} phase={phase} />
            </ClientSuspense>
          ) : null}
        </Full>
      ) : null}
      {setsu.length ? (
        <DetailSection icon={ListBulletsIcon} title="節" count={setsu.length}>
          <ul className="flex flex-col gap-2.5">
            {setsu.map((s) => (
              <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-[15px]">
                <span className="truncate">{s.name}</span>
                <span className="tabular-nums">{s.amountMissing ? <span className="text-xs text-muted-foreground">金額未記載</span> : <><Amt yen={s.yen} className="text-[15px]" />{!moku.amountMissing && moku.yen > 0 ? <span className="ml-2 inline-block w-[3.2em] text-right text-xs text-muted-foreground">{((s.yen / moku.yen) * 100).toFixed(0)}%</span> : null}</>}</span>
                {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
                <span className="col-span-2 mt-1 h-1 overflow-hidden rounded-full bg-foreground/5">
                  {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
                  <span className="block h-full rounded-full bg-primary/55" style={{ width: `${s.amountMissing || base <= 0 ? 0 : Math.min(100, (s.yen / base) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}
    </>
  )
}

/** 目の中の事業。目の科目の ID で事業の年度を絞る */
function MokuProjects({ subject, phase }: { subject: string; phase: 'initial' | 'settlement' }) {
  const { v, select } = useApp()
  const q: ListQuery = { ...v.query('all', { subjects: [subject] }), kind: phase }
  const page = useListPage(q)
  if (page === FAILED || !page.rows.length) return null
  return (
    <DetailSection icon={BriefcaseIcon} title="中の事業" count={countOf(page)}>
      <ProjectList q={q} render={(p) => (
        <button key={p.id} type="button" onClick={() => select({ kind: 'project', id: p.id })} className="flex w-full items-center gap-3 px-1.5 py-2.5 text-left hover:bg-secondary">
          <span className="min-w-0 flex-1"><span className="block text-[15px]">{p.name}</span>{p.dept ? <span className="text-xs text-muted-foreground">{p.dept}</span> : null}</span>
          <Amt yen={p.yen} className="text-[15px]" />
        </button>
      )} />
    </DetailSection>
  )
}

function Detail({ sel }: { sel: NonNullable<Selected> }) {
  const kind = { project: ['事業', BriefcaseIcon], sheet: ['事業評価', ClipboardTextIcon], moku: ['目', TreeStructureIcon] } as const
  const [label, I] = kind[sel.kind]
  const body =
    sel.kind === 'moku' ? <MokuDetail moku={sel.moku} phase={sel.phase} special={sel.special} /> : sel.kind === 'sheet' ? <SheetDetail s={sel.sheet} /> : <ClientSuspense fallback={<RowsSkeleton n={4} />}><ProjectDetail id={sel.id} /></ClientSuspense>
  return (
    <div key={`${sel.kind}${sel.id}`}>
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
      {/* 選んでいる年度を出すので、広い画面の年度の丸（選択中）と同じく緑地に白字にする */}
      <DropdownMenuTrigger render={<Button size="sm" className="h-8 rounded-full px-3 text-[13px] font-normal" />}>
        {yearName(current)}
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
  { key: 'settled', label: '決算', icon: ReceiptIcon },
  { key: 'money', label: '予算', icon: WalletIcon },
]

const TAB_SEGMENT = new RegExp(`/(${Object.values(TAB_SLUGS).join('|')})/?$`)
/** 今の URL から年度・タブ・分野の段を除いた、自治体の頁の path */
const basePath = () => location.pathname.replace(/\/fields\/[^/]+\/?$/, '').replace(PROJECT_PATH, '').replace(TAB_SEGMENT, '').replace(/\/\d{4}\/?$/, '')
/** 今の URL の分野の段（/fields/fukushi）の id */
const fieldOfPath = () => location.pathname.match(/\/fields\/([^/]+)\/?$/)?.[1] ?? null
/** 事業の頁の段（/projects/<project_id>） */
const PROJECT_PATH = /\/projects\/([^/]+)\/?$/
/** 今の URL の事業の頁の事業の ID */
const projectOfPath = () => {
  const m = location.pathname.match(PROJECT_PATH)?.[1]
  return m ? decodeURIComponent(m) : null
}
/** 事業の頁の URL の段 */
const projectSegment = (id: string) => `projects/${encodeURIComponent(id)}`

export function AppPage({ res, data, snapshot: base, flow, extras: extrasProp, setsu, sitekey, initialField, initialProject, initialTab }: { /** 頁のデータの置き場。Suspense の外で作って渡す（初めて描く前に止まると、中で作った state は捨てられて読み直しが繰り返される） */ res: Resources; data: PageData; /** 開いた年度の頁のデータ。年度・タブを移ると loader が読み直して渡す */ snapshot: Snapshot; flow?: PageFlow; /** loader が defer で渡す残り（評価シート・お金のかかる事業・新しく始めた事業） */ extras?: Promise<YearExtras>; /** loader が defer で渡す流れの節 */ setsu?: Promise<Record<string, Setsu[]>>; sitekey: string; initialField?: string; /** 事業の頁（/2026/projects/<project_id>）で開いた事業 */ initialProject?: string; initialTab?: TabKey }) {
  // 最初の画面に要らない分（評価シート・お金のかかる事業・新しく始めた事業）は loader が defer で流し、使う部分が Full（Suspense と use()）で待つ
  const d = base
  const vision = data.vision?.text
  const emblem = data.emblem?.src ?? null
  const years = React.useMemo(() => appPageYears(data), [data])
  const router = useRouter()
  const navigation = useNavigation()
  // 事業の一覧の1頁目は、一覧の key で置き場に入れる（続きの頁を足した一覧は上書きしない）
  for (const [k, page] of Object.entries(d.lists)) if (!res.peek(k)) res.set(k, page)
  React.useEffect(() => rememberJurisdiction({ code: data.code, name: data.name, path: basePath() }), [data.code, data.name])
  const year = d.year
  // 年度・タブは頁の URL で、移るたびに loader が頁のデータを読み直す。タブは押したらすぐ切り替え、届いた頁のタブに合わせ直す
  const [tab, setTabState] = React.useState<TabKey>(initialTab ?? 'overview')
  React.useEffect(() => setTabState(initialTab ?? 'overview'), [initialTab, year])
  const at = React.useRef({ year, tab })
  at.current = { year, tab }
  /** 年度・タブの頁の URL。リンクの先にして検索エンジンにも辿らせる */
  const pageHref = (y: number, t: TabKey) => `${data.path}/${y}` + (t === 'overview' ? '' : `/${TAB_SLUGS[t]}`)
  // 年度・タブを移っても、選んでいる状態とスクロールは持ち越す。タブは履歴に積み、戻るで前のタブとそのスクロールへ帰す。年度・会計は置き換える
  const move = (href: string, { push = false } = {}) => void router.visit(href, { replace: !push, preserveState: true, preserveScroll: true })
  // 年度のリンクは今のタブを引き継ぐ（予算・決算のタブはどの年度にもある）。分野の頁なら同じ分野のまま年度を移る
  const yearHref = (y: number) => (fieldPage ? `${data.path}/${y}/fields/${fieldPage}` : pageHref(y, tab))
  const setYear = (y: number) => {
    if (y === year) return
    move(yearHref(y))
    // 目の詳細は開いた年度の図の値を、評価シートはその年度の資料を持つので、年度を変えたら閉じる（事業は年度をまたいで同じ）
    select((s) => (s?.kind === 'project' ? s : null))
  }
  const setTab = (t: TabKey, { push = true, query = '' } = {}) => {
    setTabState(t)
    if (t !== at.current.tab || fieldOfPath() || projectOfPath()) move(pageHref(at.current.year, t) + query, { push })
  }
  /** 流れの会計を変える。一般会計は ?account= を付けない */
  const pickAccount = (account: string) => move(pageHref(year, at.current.tab) + (account === GENERAL ? '' : `?${new URLSearchParams({ account })}`))
  // 予算・決算のタブの頁を読み終えたのに流れが無ければ、API に繋がらなかった
  const flowFailed = (initialTab === 'money' || initialTab === 'settled') && !flow && navigation.state === 'idle'
  // 絞り込みを変えたら一覧を読み直す。読み終えるまで前の一覧を出したままにする
  const [fields, setFieldsState] = React.useState<string[]>([])
  const [filter, setFilterState] = React.useState('all')
  const setFields = (f: string[]) => React.startTransition(() => setFieldsState(f))
  const setFilter = (f: string) => React.startTransition(() => setFilterState(f))
  const [grade, setGrade] = React.useState('A')
  // ?filter=new などで事業の絞り込みを開いた状態で来られる（ホームのはじめにやることから・まとめの札から）。読んだら URL から外す。
  // まとめ（/2024）と事業のタブ（/2024/projects）は頁が別で、移ると画面を作り直して絞り込みが消えるので、go も URL で渡す
  // 頁を移る途中は URL がまだ前の頁のままなので、移り終えてから読む
  const idle = navigation.state === 'idle'
  React.useEffect(() => {
    const q = new URLSearchParams(location.search)
    const f = q.get('filter')
    if (!idle || !f) return
    if (['all', 'new', 'ended', 'eval'].includes(f)) setFilter(f)
    const g = q.get('grade')
    if (g && GRADES.some(([x]) => x === g)) setGrade(g)
    const field = q.get('field')
    if (field) setFields([field])
    for (const k of ['filter', 'grade', 'field']) q.delete(k)
    history.replaceState(history.state, '', location.pathname + (q.size ? `?${q}` : '') + location.hash)
  }, [initialTab, idle])
  // 目・評価シートを開いたら横（スマホは下）に詳細を出す。読み終えるまで前の詳細を出したままにする。事業は詳細を出さず事業の頁へ移る
  const [selected, setSelected] = React.useState<Selected>(null)
  const select = (x: Selected | ((s: Selected) => Selected)) => {
    // 目を事業の代わりにした行（moku:）は年度の資料の目なので、頁にせず詳細に出す
    if (x && typeof x !== 'function' && x.kind === 'project' && !x.id.startsWith('moku:')) return openProject(x.id)
    React.startTransition(() => setSelected(x))
  }
  // 分野の頁。URL を /fields/<id> にして、戻るで自治体の頁へ帰る。中身は開いた年度のデータで描くので loader を待たない
  const [fieldPage, setFieldPage] = React.useState<string | null>(initialField ?? null)
  // 頁の中で開いた分野の頁は履歴の state に印を付け、閉じるときは履歴を戻る（進むで戻ってきた場合も同じ）
  const openField = (id: string) => {
    select(null)
    setProjectPage(null)
    history.pushState({ ...history.state, field: id }, '', `${basePath()}/${year}/fields/${id}`)
    document.title = pageHead(data, year, { field: id }).title
    React.startTransition(() => setFieldPage(id))
    window.scrollTo({ top: 0 })
  }
  const closeField = () => {
    select(null)
    if ((history.state as { field?: string } | null)?.field) return history.back()
    setFieldPage(null)
    void router.visit(pageHref(year, tab), { preserveState: true })
    window.scrollTo({ top: 0 })
  }
  // 事業の頁。分野の頁と同じく URL を /projects/<project_id>（年度の段なし）にして、戻るで前の頁へ帰る。中身は事業の ID で読む
  const [projectPage, setProjectPage] = React.useState<string | null>(initialProject ?? null)
  const openProject = (id: string) => {
    React.startTransition(() => setSelected(null))
    history.pushState({ ...history.state, project: id }, '', `${basePath()}/${projectSegment(id)}`)
    React.startTransition(() => {
      setFieldPage(null)
      setProjectPage(id)
    })
    window.scrollTo({ top: 0 })
  }
  const closeProject = () => {
    if ((history.state as { project?: string } | null)?.project) return history.back()
    setProjectPage(null)
    setTabState('projects')
    void router.visit(pageHref(year, 'projects'), { preserveState: true })
    window.scrollTo({ top: 0 })
  }
  React.useEffect(() => {
    // 戻る・進むでは、URL の分野・事業に画面を合わせる（年度・タブは移った頁の loader が渡す）
    const onPop = () => {
      select(null)
      setFieldPage(fieldOfPath())
      setProjectPage(projectOfPath())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const wide = useMedia('(min-width: 1280px)')
  const phone = useMedia('(max-width: 767px)')
  // やめた事業は前の年度の科目を持つので、やめた事業を出すときは前の年度の分野の科目を読んで分野を引く
  const prevKey = d.prev ? `field-subjects:${d.code}:${d.prev.year}` : ''
  const [prevFields, setPrevFields] = React.useState<{ key: string; x: Record<string, string[]> }>()
  React.useEffect(() => {
    const prev = d.prev
    if (filter !== 'ended' || !prev) return
    let live = true
    void res.get(prevKey, () => fieldSubjects(d.code, prev.year, prev.kind)).then((x) => {
      if (live && x !== FAILED) setPrevFields({ key: prevKey, x })
    })
    return () => {
      live = false
    }
  }, [filter, prevKey])
  const prevFieldSubjects = prevFields?.key === prevKey ? prevFields.x : undefined
  const v = React.useMemo(() => (d.years[year] ? yearView(d, prevFieldSubjects) : undefined), [d, year, prevFieldSubjects])

  // タブの真上の目印。タブを変えたとき、タブが上に貼り付いていたらここまで戻す
  const tabsTop = React.useRef<HTMLDivElement>(null)
  const changeTab = (t: TabKey, query?: string) => {
    setTab(t, { query })
    const el = tabsTop.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }
  const go: Go = (t, opt = {}) => {
    if (opt.filter) setFilter(opt.filter)
    if (opt.grade) setGrade(opt.grade)
    if (t === 'projects') setFields(opt.field ? [opt.field] : [])
    const q = new URLSearchParams(Object.entries(opt).filter((e): e is [string, string] => !!e[1]))
    changeTab(t, t === 'projects' && opt.filter ? `?${q}` : undefined)
  }

  // スマホではタブの中身を左右のスワイプで切り替える（shadcn の Carousel）。高さは今のタブに合わせる
  const [api, setApi] = React.useState<CarouselApi>()
  // 予算・決算のタブはどの年度にも出す。収録の無い年度はタブの中で「まだ収録していない」と出す
  const tabs = TABS
  const tabsRef = React.useRef(tabs)
  tabsRef.current = tabs
  // 事業評価は評価した事業を行った年度にだけある。評価の無い年度へ移ったら絞り込みを戻す
  const index = Math.max(0, tabs.findIndex((t) => t.key === tab))
  // 始めの位置は Carousel を置いたときだけ渡す。タブのたびに変わると embla が作り直されて、滑らずに飛ぶ
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const carouselOpts = React.useMemo(() => ({ startIndex: index, watchDrag: startsTabSwipe }), [phone, fieldPage])
  React.useEffect(() => {
    if (!api) return
    const onSelect = () => changeTab(tabsRef.current[api.selectedScrollSnap()]!.key)
    api.on('select', onSelect)
    return () => void api.off('select', onSelect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])
  React.useEffect(() => {
    // タブを押したときは滑らせずに切り替える（指で横に動かしたときは指に付いて動く）
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index, true)
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
    // 分野の頁から戻ると Carousel が作り直されるので、新しいスライドを測り直す
  }, [phone, index, v, fieldPage])

  const header = (
    <header className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 py-7 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-6">
      <div className="grid size-20 place-items-center rounded-xl border bg-emblem p-2.5 sm:size-[108px] sm:rounded-2xl sm:p-4">
        {emblem ? <img src={emblem} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <span className="text-3xl text-foreground sm:text-5xl">{data.name[0]}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* 年度の切り替えは、まとめ以外のタブの見出しの横に置く（まとめには置かない） */}
        <h1 className="min-w-0 text-[22px] font-normal leading-7 sm:text-[26px] sm:leading-8">{data.name}</h1>
        {vision ? <p className="mt-2 text-base leading-snug sm:mt-0 sm:text-[17px]">{vision}</p> : null}
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1.5 whitespace-nowrap text-xs text-muted-foreground sm:gap-x-6 sm:text-sm">
          <span className="inline-flex items-center gap-1 sm:gap-1.5"><MapPinIcon className="size-3.5 sm:size-4" aria-hidden="true" />{data.prefecturePath ? <Button variant="link" size="inline" nativeButton={false} render={<Link href={data.prefecturePath} />}>{data.prefecture}</Button> : data.prefecture}</span>
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
    !v ? null : key === 'overview' ? <Overview /> : key === 'money' ? <MoneyTab key={v.year} phase="initial" /> : key === 'settled' ? <MoneyTab key={v.year} phase="settlement" /> : <ProjectsTab filter={filter} setFilter={setFilter} fields={fields} setFields={setFields} grade={grade} setGrade={setGrade} />

  return (
    <div className={cn('@container transition-[padding] duration-300', wide && selected && 'pr-[440px]')}>
      <div className="mx-auto max-w-[1120px] px-4 pb-48">
        {header}
        <Separator />
        <Tabs value={tab} onValueChange={(t) => changeTab(t as TabKey)} className="gap-0">
          <div ref={tabsTop} aria-hidden="true" />
          {/* 区切りの線は画面の端から端まで引く（50cqw は外側の幅の半分、50% は中身の幅の半分。px で文字の位置は中身に揃える） */}
          <div className="sticky top-0 z-20 mx-[calc(50%-50cqw)] px-[calc(50cqw-50%)] bg-background">
            {/* 下線を区切りの線に重ねて、線が二重に見えないようにする */}
            <Separator className="absolute inset-x-0 bottom-0 data-horizontal:w-auto" />
            {/* スクロールしたら上にタブを残す。下に Separator を引いて中身と分ける */}
            <div className="flex items-center gap-3">
            {projectPage || fieldPage ? (
              <div className="relative z-10 flex h-12 min-w-0 flex-1 items-center sm:h-[52px]">
                <Button variant="ghost" onClick={projectPage ? closeProject : closeField} className="-ml-2 text-[15px] sm:text-[17px]"><CaretLeftIcon data-icon="inline-start" />{data.name}</Button>
              </div>
            ) : (
            <TabsList variant="line" className="relative z-10 min-w-0 flex-1 justify-start gap-2 overflow-x-auto p-0 [scrollbar-width:none] group-data-horizontal/tabs:h-12 sm:gap-4 sm:group-data-horizontal/tabs:h-[52px]">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} nativeButton={false} render={<a href={pageHref(year, t.key)} />} onClick={(e) => (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ? e.preventBaseUIHandler() : e.preventDefault())} className="no-underline h-full flex-none gap-1.5 px-3 py-0 has-data-[icon=inline-start]:pl-2.5 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:text-foreground text-[15px] leading-none data-active:text-primary data-active:hover:text-primary data-active:focus-visible:text-primary dark:data-active:text-primary group-data-horizontal/tabs:after:-bottom-[0.5px] group-data-horizontal/tabs:after:h-[2.5px] after:bg-primary sm:text-[17px]">
                  <t.icon data-icon="inline-start" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            )}
            </div>
          </div>
          {v ? (
            <AppContext.Provider value={{ d, page: data, years, v, res, select, selected, go, openField, flow, flowFailed, pickAccount, setsu, extras: extrasProp, prevFieldSubjects, setYear, yearHref }}>
              {projectPage ? (
                <div key={projectPage} className="pt-6"><ProjectPage id={projectPage} /></div>
              ) : fieldPage ? (
                <div key={fieldPage} className="pt-6"><FieldPage id={fieldPage} /></div>
              ) : phone ? (
                <Carousel setApi={setApi} opts={carouselOpts} className="-mx-4 pt-5">
                  <CarouselContent className="ml-0 items-start" style={{ height }}>
                    {tabs.map((t, i) => (
                      <CarouselItem key={t.key} className="px-4">
                        <div ref={(el) => void (slides.current[i] = el)}>{panel(t.key)}</div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>
              ) : (
                tabs.map((t) => (
                  <TabsContent key={t.key} value={t.key} className="pt-6">
                    {panel(t.key)}
                  </TabsContent>
                ))
              )}

              {/* 詳細: 広い画面は右に固定して一覧と並べる（Sheet は背景を塞ぐので使わない）。中間幅は右からの Sheet、スマホは下からの Drawer */}
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
              ) : phone ? (
                // スマホは下からの Drawer。つまんで下へ引くと閉じる
                <Drawer open={!!selected} onOpenChange={(o) => !o && select(null)} showSwipeHandle>
                  <DrawerContent className="[--drawer-height:calc(100dvh-5rem)]">
                    <DrawerTitle className="sr-only">詳細</DrawerTitle>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-3">{selected ? <Detail sel={selected} /> : null}</div>
                  </DrawerContent>
                </Drawer>
              ) : (
                <Sheet open={!!selected} onOpenChange={(o) => !o && select(null)}>
                  <SheetContent side="right" className="w-[440px] gap-0 overflow-hidden sm:max-w-[440px]">
                    <SheetTitle className="sr-only">詳細</SheetTitle>
                    {/* 閉じるボタンに focus が移っても中身が下まで送られないよう、送るのは中の箱にする */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5">{selected ? <Detail sel={selected} /> : null}</div>
                  </SheetContent>
                </Sheet>
              )}
            </AppContext.Provider>
          ) : (
            <p className="pt-6 text-sm text-muted-foreground">データを読み込めませんでした。頁を読み込み直してください。</p>
          )}
        </Tabs>
      </div>
      <AskDock name={data.name} code={data.code} sitekey={sitekey} year={year} detail={() => (v ? (projectPage ? describeProject(res.peek<Loaded<ProjectFull>>(projectLatestKey(projectPage))) : describeSelected(selected, withPeekedExtras(d, res), prevFieldSubjects, res)) : '')} section={TABS.find((t) => t.key === tab)?.label} />
    </div>
  )
}
