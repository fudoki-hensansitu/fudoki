// 自治体の頁（アプリ型）。ヘッダーの下を「まとめ・事業・予算・決算」のタブにし（予算・決算のタブはどの年度にも出す）。事業は一覧から事業の頁へ移る。
// 一覧は名前と金額だけを出し、説明は詳細にだけ出す。部品は shadcn/ui（Tabs・Carousel・Card・Input・ToggleGroup）
import * as React from 'react'
import { useNavigation, useRouter } from '@void/react'
import {
  ArrowSquareOutIcon,
  BankIcon,
  BasketballIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CaretRightIcon,
  DotsThreeCircleIcon,
  FileDashedIcon,
  ArrowsSplitIcon,
  TableIcon,
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
  type Icon,
} from '@phosphor-icons/react'
import { MoreDots } from '@/components/more-dots'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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
import { FlowTable, type FlowQuery } from '../flow-table'
import { COFOG_NAMES } from '@fudoki/fiscal/cofog-master'
import { DOMAIN_FRAMES, OTHER_FRAME, frameOf } from '../domains'
import { rememberJurisdiction } from '../../home/recent'
import { Hint } from '@/components/hint'
import { AskDock } from '../ask-dock'
import { appPageYears, formatAsOf, formatPeople, reiwa, yearName, type Drill, type Moku, type PageData, type PageFlow, type Setsu, type YearTotal, TAB_SLUGS, hasDocument, type PageTab } from '../types'
import { Title, titleVariants } from '@/components/ui/title'
import { withExtras, yearView, type AccountTotal, type Proj, type Snapshot, type YearExtras, type YearView } from './data'
import { fieldSubjects, listKey, listPage, projectLatest, type ListPage, type ListQuery, type ProjectFull } from './api'
import { ClientSuspense, FAILED, Resources, type Loaded } from './resource'
import { Amt, yenParts } from './amount'
import { FinanceSections } from './finance'
import { IncomeFlow } from './income-flow'
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
type Ctx = { d: Snapshot; page: PageData; years: number[]; v: YearView; res: Resources; /** 事業の頁へ移る */ openProject: (id: string) => void; go: Go; openField: (id: string) => void; /** 予算・決算のタブの頁で loader が読んだ流れ */ flow?: PageFlow; /** 予算・決算のタブの頁なのに流れを読めなかった（API に繋がらなかった） */ flowFailed: boolean; /** 流れの会計を変える（?account= の頁へ移る） */ pickAccount: (account: string) => void; /** loader が defer で渡す流れの節 */ setsu?: Promise<Record<string, Setsu[]>>; /** loader が defer で渡す残り（評価シート・お金のかかる事業）。useFullView が use() で待つ */ extras?: Promise<YearExtras>; prevFieldSubjects?: Record<string, string[]>; /** 年度を移る（タブの見出しの年度の切り替え） */ setYear: (y: number) => void; /** 年度の頁の URL（今のタブのまま） */ yearHref: (y: number) => string }
/** 文脈に添える、開いている事業の評価シートの数の上限（文脈の長さの上限に収める） */
const DETAIL_SOURCES = 3
/** 開いている事業を、アシスタントに渡す文脈の行にする。金額は at（無ければ事業が持つ年度と資料）のもの */
function describeProject(p: Loaded<ProjectFull> | undefined, at?: { year: number; kind: string }): string {
  if (!p || p === FAILED) return ''
  const year = at?.year ?? p.year
  const kind = at?.kind ?? p.kind
  const now = year === undefined ? null : ((kind === 'initial' ? p.y[String(year)]?.b : p.y[String(year)]?.s) ?? null)
  const source = (label: string, x: { id: string; fy: number; origin: string; page: number }, name: string) => `${label}: ${r(x.fy)}「${name}」（origin_id ${x.origin}、${x.page}頁、sheet_id ${x.id}）`
  return [
    `開いている事業: ${p.name}（${[p.path.filter(Boolean).join(' > '), p.dept].filter(Boolean).join('、')}）${now != null && year !== undefined ? `、${r(year)}の${kind === 'initial' ? '当初予算' : '決算'} ${yenText(now)}` : ''}（project_id ${p.id}）`,
    ...p.sheets.map((s) => source(`この事業の評価シート（${r(s.fy)}に行った事業の評価）`, s, s.name)).slice(0, DETAIL_SOURCES),
  ].join('\n')
}

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
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground [&_svg]:size-3">{children}</span>
}
function SectionHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <Title size="h3" as="h2">
        {title}
        {sub ? <span className="ml-2 text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </Title>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
/** タブの年度の切り替え。広い画面は年度を並べ、狭い画面はメニュー1つ */
function TabYear() {
  const { years, v, setYear, yearHref } = useApp()
  // 頁の上に貼り付くタブの帯は、この切り替えが帯の下に隠れたら同じ切り替えを帯に出す（data-tab-year で探す）
  return (
    <div data-tab-year className="shrink-0">
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
        <Title size="h2">{title}</Title>
        <TabYear />
      </div>
      <p className="mt-2 text-sm leading-[1.7] text-muted-foreground">{children}</p>
    </div>
  )
}

const IconBox = ({ children }: { children: React.ReactNode }) => <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-card text-muted-foreground [&_svg]:size-4">{children}</span>

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
          <Link key={x.href} href={x.href} className="flex items-center gap-3 px-3 py-3 text-base text-foreground no-underline transition-colors hover:bg-card">
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
const LoadFailed = () => <p className="px-3 py-4 text-sm text-muted-foreground">読み込めませんでした。少し待ってから開き直してください。</p>

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
    // 文節で折り返す設定のままだと、長い事業名が狭い幅で列を押し広げるので、収まらないときは文節の途中でも折り返す
    <span className="block [overflow-wrap:anywhere]">
      {/* 押せることとフォーカスは事業名のボタンが持つ（行を押しても同じく詳細を開く） */}
      <button type="button" className="rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">{p.name}</button>
      {ended || v.isNew(p) ? <span className="ml-2 inline-flex align-middle">{ended ? <Mark kind="stop" label="やめた事業" className="size-5" /> : <Mark kind="new" label="新しく始める事業" className="size-5" />}</span> : null}
      {/* 狭い幅で事業名の下に添える分野は、事業名より控えめな色にする */}
      <span className="flex items-center gap-1 text-muted-foreground @3xl:hidden"><FieldIcon id={v.fieldOf(p)} className="size-4 shrink-0" />{[fieldName(v, v.fieldOf(p)), 'grade' in p && p.grade ? `評価 ${p.grade}` : null].filter(Boolean).join(' · ')}</span>
    </span>
  )
}
function ProjectFieldCell({ p }: { p: Proj }) {
  const { v } = useApp()
  return <span className="inline-flex items-center gap-2"><FieldIcon id={v.fieldOf(p)} className="size-4 shrink-0 text-muted-foreground" />{fieldName(v, v.fieldOf(p))}</span>
}

/** 事業の表（shadcn の data table）。並びは api が返した金額の多い順のまま。行を押すと詳細を開く。文字は見出しも中身もすべて同じ大きさ・同じ色にする（狭い画面で名前の下に出す分野だけは薄い色） */
function ProjectTable({ rows, ended }: { rows: Proj[]; /** やめた事業は前の年度の額を出す */ ended?: boolean }) {
  const { v, openProject } = useApp()
  const by = ended ? v.year - 1 : v.year
  const amount = `${r(by)} ${v.label(by)}`
  const graded = rows.some((p) => 'grade' in p && p.grade)
  const columns = React.useMemo(() => projectColumn.columns([
    projectColumn.accessor('rank', { header: () => <span className="sr-only">順位</span>, cell: (c) => c.getValue(), meta: { className: 'w-8 pr-0 text-right tabular-nums' } }),
    projectColumn.display({ id: 'name', header: '事業名', cell: (c) => <ProjectNameCell p={c.row.original} />, meta: { className: 'whitespace-normal' } }),
    projectColumn.display({ id: 'field', header: '分野', cell: (c) => <ProjectFieldCell p={c.row.original} />, meta: { className: '@max-3xl:hidden w-44' } }),
    projectColumn.accessor('yen', { header: () => <span className="inline-flex items-center gap-1">{amount}<ArrowDownIcon className="size-3.5" aria-label="多い順" /></span>, cell: (c) => (c.getValue() == null ? '—' : yenText(c.getValue()!)), meta: { className: 'w-40 text-right tabular-nums' } }),
    // 評価の列は、頁の中に評価のある事業があるときだけ出す
    ...(graded ? [projectColumn.accessor('grade', { header: '評価', cell: (c) => c.getValue() ?? '', meta: { className: '@max-3xl:hidden w-16 text-center' } })] : []),
  ]), [amount, graded])
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
          // 目を事業の代わりにした行（moku:）は押せない
          const moku = row.original.id.startsWith('moku:')
          return (
            <TableRow key={row.id} onClick={moku ? undefined : () => openProject(row.original.id)} className={moku ? 'hover:bg-transparent' : 'cursor-pointer hover:bg-card'}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn('py-3', cls(cell.column.columnDef.meta))}>
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



/** 件数（数えるのを打ち切ったら「以上」） */

// ---------- 画面 ----------
type TabKey = PageTab
type Go = (t: TabKey, opt?: { filter?: string; field?: string }) => void


/** 分野の行。名前・金額・棒・割合を1行に並べる。割合は前景色で、緑は棒だけに置く */
function FieldRow({ f, i, max, onClick, grow = true }: { f: YearView['fields'][number]; i: number; max: number; onClick: () => void; /** 棒を伸ばすアニメーションを出す */ grow?: boolean }) {
  const { v } = useApp()
  const pct = (f.yen / v.total) * 100
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-3 py-3 text-left transition-colors hover:bg-card sm:grid-cols-[10rem_minmax(0,1fr)_4.5rem]">
      <span className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
        <span className="block truncate text-base font-medium">{f.name}</span>
        <span className="block text-xs text-muted-foreground"><Amt yen={f.yen} /></span>
      </span>
      <span className="col-span-2 col-start-1 row-start-2 block h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:col-start-auto sm:row-start-auto">
        <span className={cn(grow && 'app-grow', 'block h-full rounded-full bg-primary')} style={{ width: `${Math.max(1, (f.yen / max) * 100)}%`, animationDelay: `${i * 30}ms` }} />
      </span>
      <span className="col-start-2 row-start-1 text-right text-base tabular-nums sm:col-start-auto sm:row-start-auto">
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


const GENERAL = '一般会計'

function AccountCards({ accounts, account, setAccount }: { accounts: AccountTotal[]; account: string; setAccount: (a: string) => void }) {
  if (accounts.length <= 1) return null
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2" role="radiogroup" aria-label="会計">
      {accounts.map((x) => (
        <button key={x.name} type="button" role="radio" aria-checked={x.name === account} onClick={() => setAccount(x.name)} data-selected={x.name === account || undefined} className="flex min-w-0 flex-col items-start rounded-xl bg-card px-4 py-3 text-left ring-1 ring-inset ring-transparent transition-colors hover:bg-accent data-selected:bg-accent data-selected:ring-primary">
          <span className="max-w-full text-xs text-muted-foreground [overflow-wrap:anywhere]">{x.name}</span>
          <Amt yen={x.yen} className="text-base text-primary" />
        </button>
      ))}
    </div>
  )
}

/** 予算・決算。事業は下から積み上げる見方、こちらは大きい項目から下りていく見方。当初予算と決算の両方がある年度はタブを分ける */
/** 流れの目（歳入の目も）に節を足す */
const withSetsu = (flow: PageFlow, byMoku: Record<string, Setsu[]>): PageFlow => {
  const moku = (m: Moku): Moku => ({ ...m, setsu: byMoku[m.id] ?? m.setsu })
  const drills = (ds: Drill[]) => ds.map((k) => ({ ...k, kou: k.kou.map((o) => ({ ...o, moku: o.moku.map(moku) })) }))
  return { ...flow, drills: drills(flow.drills), loose: flow.loose.map(moku), ...(flow.revenue ? { revenue: drills(flow.revenue) } : {}) }
}

function MoneyTab({ phase }: { phase: 'initial' | 'settlement' }) {
  const { v, d, res, page, flow, flowFailed, pickAccount, setsu: setsuProp, openField } = useApp()
  const y = d.years[String(v.year)]
  const total: YearTotal | undefined = y?.kind === phase ? { year: v.year, yen: y.total, kan: [] } : undefined
  // 収録はあるが、今の頁のデータが別の資料（スマホで隣のタブを開いた頁など）なら、タブへ移って loader が読むまで待つ
  const recorded = hasDocument(page, v.year, phase)
  const label = phase === 'initial' ? '当初予算' : '決算'
  const revenueDoc = page.revenue?.find((r) => r.year === v.year && r.kind === phase && r.total > 0)
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
  const drills = current?.drills
  const flows = current?.drills
  const router = useRouter()
  const accounts = d.accounts ?? []
  // 会計の総額は頁のデータの資料のもの。別の資料のタブ（スマホで隣に並ぶタブ）では使わない
  const special = account === GENERAL || !total ? undefined : accounts.find((x) => x.name === account)
  const picked: YearTotal | undefined = special ? { year: v.year, yen: special.yen, kan: [] } : total
  // お金の流れの見せ方（初めはサンキー図）と表の探す語は URL に持つ（?flow=table・歳出の ?exp_q=・歳入の ?rev_q=）。履歴は積まない
  const [view, setView] = React.useState<'sankey' | 'table'>('sankey')
  const [flowQuery, setFlowQuery] = React.useState<FlowQuery>({ expenditure: '', revenue: '' })
  React.useEffect(() => {
    const q = new URLSearchParams(location.search)
    const found = { expenditure: q.get('exp_q') ?? '', revenue: q.get('rev_q') ?? '' }
    setFlowQuery(found)
    if (q.get('flow') === 'table' || found.expenditure || found.revenue) setView('table')
  }, [])
  React.useEffect(() => {
    const q = new URLSearchParams(location.search)
    const set = (k: string, x: string) => (x ? q.set(k, x) : q.delete(k))
    const table = view === 'table'
    set('flow', table ? 'table' : '')
    set('exp_q', table ? flowQuery.expenditure.trim() : '')
    set('rev_q', table ? flowQuery.revenue.trim() : '')
    const next = location.pathname + (q.size ? `?${q}` : '') + location.hash
    if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', next)
  }, [view, flowQuery])
  return (
    <div className="flex flex-col gap-3">
      <TabHead title={label === '決算' ? '決算' : '予算'}>
        {phase === 'settlement'
          ? '決算は、1年間に実際に入ったお金と使ったお金を、年度が終わった後にまとめたものです。議会の認定を受けて確定します。'
          : '予算は、1年間に何にいくら使うかを、年度が始まる前に決めた計画です。議会の議決を経て決まります。このタブでは、年度の初めに決めた当初予算を扱います。'}
      </TabHead>
      {/* 入る→使う（一般会計の歳入と歳出の総額と流れ）。その年度・資料の歳入を収録しているときだけ */}
      {total && revenueDoc ? <IncomeFlow doc={revenueDoc} revenue={current?.revenue} phase={phase} expTotal={total.yen} fields={v.fields} pop={d.pop} openField={openField} /> : null}
      {total ? <FieldsSection phase={phase} /> : null}
      {total ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <Title size="h3" as="h2">お金の流れ</Title>
            <ToggleGroup aria-label="お金の流れの見せ方" value={[view]} onValueChange={(v) => { if (v[0]) setView(v[0] as typeof view) }} spacing={0} className="grid shrink-0 grid-cols-2 rounded-full bg-secondary p-1">
              <ToggleGroupItem value="sankey" className="w-full rounded-full! px-3">
                <ArrowsSplitIcon aria-hidden="true" className="-rotate-90" />サンキー
              </ToggleGroupItem>
              <ToggleGroupItem value="table" className="w-full rounded-full! px-3">
                <TableIcon aria-hidden="true" />表
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-sm leading-[1.7] text-muted-foreground">{current?.revenue?.length ? '歳入（左）と歳出（右）が、款から項・目へとどう分かれていくかを示しています。' : '歳出が、款から項・目へとどう分かれていくかを示しています。'}会計を選ぶと、その会計の流れに切り替わります。</p>
        </div>
      ) : null}
      {total ? <AccountCards accounts={accounts} account={account} setAccount={setAccount} /> : null}
      {picked && view === 'table' ? (
        <FlowTable key={`${v.year}-${phase}-${account}`} flows={flows} revenue={current?.revenue} total={picked.yen} query={flowQuery} onQuery={(k, x) => setFlowQuery((f) => ({ ...f, [k]: x }))} />
      ) : picked ? (
        <Flow key={`${v.year}-${phase}-${account}`} flows={flows} revenue={current?.revenue} total={picked} onRetry={flowFailed && !drills ? () => void router.refresh({ preserveState: true, preserveScroll: true }) : undefined} bare natural className="scroll-mt-16 @4xl:scroll-mt-16" />
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

/** 何に使う？／何に使った？（歳出を分野ごとに）。予算・決算のタブのお金の流れの上に置く。棒を押すと分野の頁へ */
// タブへ移ると、すぐ描いた頁を loader が読み終えた頁で作り直すので、同じ棒を少し前に伸ばしたなら作り直した頁では伸ばさない
const grownAt = new Map<string, number>()
function FieldsSection({ phase }: { phase: 'initial' | 'settlement' }) {
  const { d, v, openField } = useApp()
  const max = Math.max(...v.fields.map((x) => x.yen))
  const [grow] = React.useState(() => {
    // サーバーの描画は頁ごとに1回なので覚えない（覚えると別の人の頁と食い違う）
    if (typeof window === 'undefined') return true
    const key = `${d.code}:${v.year}:${phase}`
    const last = grownAt.get(key)
    grownAt.set(key, Date.now())
    return last === undefined || Date.now() - last > 5000
  })
  return (
    <section className="mb-5">
      <Title size="h3" as="h2" className="mb-3">
        {phase === 'initial' ? '何に使う？' : '何に使った？'}<span className="ml-2 text-sm font-normal text-muted-foreground">歳出</span>
        <Amt yen={v.total} className="ml-2 font-medium text-primary" />
      </Title>
      <p className="mb-3 text-sm leading-[1.7] text-muted-foreground">税金を主な財源にする基本の会計（一般会計）の歳出を、使い道の分野ごとに分けています。</p>
      {/* 棒の長さは一番大きい分野を満たんにし、割合の数字は合計に対する比のまま出す */}
      <div className="grid gap-x-8 @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-(--rows)" style={{ '--rows': `repeat(${Math.ceil(v.fields.length / 2)}, auto)` } as React.CSSProperties}>
        {v.fields.map((f, i) => <FieldRow key={f.id} f={f} i={i} max={max} grow={grow} onClick={() => openField(f.id)} />)}
      </div>
    </section>
  )
}

function Overview() {
  const { v, page } = useApp()
  return (
    <div className="flex flex-col gap-8">
      {/* ホームのまちの札と同じく、濃い緑の地に総額と1人あたりを載せる。事業の件数は出さない */}
      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
        <p className="text-sm opacity-80">{reiwa(v.year)}の{v.word}（一般会計）</p>
        <Amt yen={v.total} className={cn(titleVariants({ size: 'display' }), 'mt-1 block')} />
        {v.perHead != null ? (
          <p className="mt-2 text-sm opacity-80">
            1人あたり <Amt yen={v.perHead} />
          </p>
        ) : null}
      </section>

      {/* 借金と貯金・事業に回ったお金・財政の指標（総務省の決算状況調。web の D1 から loader が頁のデータに入れる） */}
      <FinanceSections finance={page.finance} year={v.year} people={page.population?.people ?? null} />
      <Elsewhere />
    </div>
  )
}

const KINDS = [
  { id: 'new', label: '新しく始める', icon: <NewIcon className="size-4 text-primary" /> },
  { id: 'ended', label: 'やめた', icon: <StopIcon className="size-4 text-primary" /> },
] as const
// 絞り込みのボタン（Apple の pop-up / pull-down button と同じく、押すとメニューが開き、今の値をボタンに出す）。絞っている間は緑地にする
const filterTrigger = (on: boolean) => cn('inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border px-4 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-card')
/** 事業の区分（新しく始める・やめた）。1つだけ選ぶ（引く年度の資料が違うので重ねられない）。既定は「すべての事業」。
 */
function KindMenu({ v, filter, setFilter }: { v: YearView; filter: string; setFilter: (f: string) => void }) {
  const shown = v.comparable ? KINDS : []
  // 一覧の読み直しは transition で遅れて届くので、選んだ状態は手元に持ってすぐ出す
  const [value, setValue] = React.useState(filter)
  React.useEffect(() => setValue(filter), [filter])
  const picked = KINDS.find((k) => k.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="事業の区分で絞る" className={filterTrigger(!!picked)}>
        <span className="min-w-0 truncate">{picked?.label ?? 'すべての事業'}</span>
        <CaretDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(x) => { setValue(x as string); setFilter(x as string) }}>
          <DropdownMenuRadioItem value="all" closeOnClick>すべての事業</DropdownMenuRadioItem>
          {shown.length ? <DropdownMenuSeparator /> : null}
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
        {value.length === 1 ? <FieldIcon id={value[0]!} className="size-4 shrink-0" /> : null}
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

function ProjectsTab({ filter, setFilter, fields, setFields, q, setQ }: { filter: string; setFilter: (f: string) => void; /** 選んだ分野（空はすべて） */ fields: string[]; setFields: (f: string[]) => void; /** 探す語（URL の ?q=） */ q: string; setQ: (q: string) => void }) {
  const { v, res } = useApp()
  // 入力は少し待ってから絞る（打つたびに API を呼ばない）。待つあいだと読むあいだは前の一覧を出したまま
  const [text, setText] = React.useState(q)
  // 戻る・URL から語が変わったら入力欄も合わせる
  React.useEffect(() => setText((t) => (t.trim() === q ? t : q)), [q])
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const onText = (t: string) => {
    setText(t)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setQ(t.trim()), 300)
  }
  // 件数は出さない。新しく始める事業だけ、何を新しいとしたかを添える
  const head = () => (filter === 'new' ? <p className="px-3 text-xs text-muted-foreground">予算書で新しく現れた事業</p> : null)
  const body = (v: YearView) => {
    const list = v.query(filter as ListQuery['filter'], { ...cofogOf(fields), ...(q ? { q } : {}) })
    // 事業の収録の無い自治体は、目を事業の代わりに並べる（手元に全部ある）
    const moku = v.hasProjects !== false ? [] : v.mokuRows.filter((p) => (!fields.length || fields.includes(v.fieldOf(p))) && (!q || p.name.includes(q)))
    return !v.hasProjects ? (
      // 目には始めた年度が無いので、新しく始める・やめた事業は出さない
      filter === 'all' ? (
        <>
          {head()}
          <Infinite items={moku} list={(rows) => <ProjectTable rows={rows} />} />
        </>
      ) : null
    ) : list ? (
      <ClientSuspense fallback={<RowsSkeleton />} ready={!!res.peek(listKey(list))}>
        <ProjectList q={list} head={() => head()} />
      </ClientSuspense>
    ) : null
  }
  return (
    <div className="flex flex-col gap-2">
      <TabHead title="事業">事業は、自治体がお金を使って行う一つ一つの仕事です。</TabHead>
      {/* 検索の行と、絞り込み（事業の区分・分野の combobox）の行を分ける */}
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={text} onChange={(e) => onText(e.target.value)} placeholder="事業名・担当の課で探す" className="h-9 rounded-full pl-9" aria-label="事業を探す" />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {/* メニューは分野と同じくいつも出す。新しく始める・やめたは残り（defer）が届き、前の年度と比べられるときだけ選べる */}
        <Full fallback={<KindMenu v={v} filter={filter} setFilter={setFilter} />}>{(v) => <KindMenu v={v} filter={filter} setFilter={setFilter} />}</Full>
        <FieldMenu v={v} fields={fields} setFields={setFields} />
      </div>
      {/* 事業の収録があるかは、事業のタブの頁なら loader が渡し、他のタブの頁（スマホで横に並ぶ事業のタブ）では残り（defer）で届く */}
      {v.hasProjects === undefined ? <Full fallback={<RowsSkeleton />}>{(v) => (v.failed && v.hasProjects === undefined ? <LoadFailed /> : body(v))}</Full> : body(v)}
    </div>
  )
}

// ---------- 詳細 ----------
function DetailSection({ icon: I, title, children }: { icon: Icon; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <Title size="headline" as="h3" className="mb-2 flex items-center gap-2"><I className="size-4 text-muted-foreground" aria-hidden="true" />{title}</Title>
      {children}
    </section>
  )
}
/** 事業の名前。新しく始める・やめた事業の印は名前の後ろに付ける */
function ProjectTitle({ p, mark }: { p: Pick<ProjectFull, 'name'>; mark: 'new' | 'stop' | null }) {
  return (
    <>
      <Title size="h2" className="mb-2 flex items-start gap-2">
        {p.name}
        {mark === 'stop' ? <Mark kind="stop" label="やめた事業" /> : mark === 'new' ? <Mark kind="new" label="新しく始める事業" /> : null}
      </Title>
    </>
  )
}

/** 事業の頁を開いたときに history.state に持つもの */
type ProjectHistory = { project: string; depth?: number; fromList?: boolean }

const projectLatestKey = (id: string) => `project-latest:${id}`

/** 事業の頁の戻る先。事業のタブと、入れ子の上にある事業をすべてパンくずに並べ、押すとそこへ戻る */
function ProjectBack({ res, id, label, close, open }: { res: Resources; id: string; label: string; close: () => void; open: (id: string) => void }) {
  const p = React.use(res.get(projectLatestKey(id), () => projectLatest(id)))
  return <ProjectCrumbs label={label} close={close} open={open} ancestors={p === FAILED ? [] : (p.ancestors ?? [])} />
}
function ProjectCrumbs({ label, close, open, ancestors }: { label: string; close: () => void; open: (id: string) => void; ancestors: NonNullable<ProjectFull['ancestors']> }) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-sm sm:text-base">
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink render={<button type="button" onClick={close} />} className="inline-flex cursor-pointer items-center gap-1"><ListBulletsIcon className="size-4 shrink-0" aria-hidden="true" />{label}</BreadcrumbLink>
        </BreadcrumbItem>
        {ancestors.map((a) => (
          <React.Fragment key={a.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-[3em]">
              <BreadcrumbLink render={<button type="button" onClick={() => open(a.id)} />} className="min-w-0 cursor-pointer truncate">{a.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** 年度ごとの表の評価（A〜D）。評価シートの出典が分かれば、評価からそのシートの頁を開く */
function GradeLink({ grade, href, label }: { grade?: string; href?: string; label: string }) {
  if (!grade) return null
  if (!href) return <>{grade}</>
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={`${label}（評価 ${grade}）`} className="inline-flex items-center gap-1 text-foreground no-underline hover:text-primary hover:underline">
      {grade}
      <ArrowSquareOutIcon className="size-3 text-muted-foreground" aria-hidden="true" />
    </a>
  )
}

/** 年度ごとの表の額。出典の頁が分かれば、額から公式の資料（その頁）を開く */
function SourceAmt({ yen, href, label }: { yen: number | null | undefined; href?: string; label: string }) {
  if (yen == null || !href) return <Amt yen={yen} className="text-sm" />
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={`${label}（${yenText(yen)}）`} className="inline-flex items-center gap-1 text-foreground no-underline hover:text-primary hover:underline">
      <Amt yen={yen} className="text-sm" />
      <ArrowSquareOutIcon className="size-3 text-muted-foreground" aria-hidden="true" />
    </a>
  )
}

/** 事業の頁（/tokyo/shinagawa/projects/<project_id>）。一覧の行・評価シート・分野の頁の事業から開く。事業は年度をまたぐので年度の段を持たず、
 * 金額は年度ごとの表で出す（大きな金額は出さない）。内訳（中の事業）は事業の最新の年度（決算があれば決算）のもの */
function ProjectPage({ id }: { id: string }) {
  return (
    <ClientSuspense fallback={<RowsSkeleton n={4} />}>
      <ProjectPageBody id={id} />
    </ClientSuspense>
  )
}

function ProjectPageBody({ id }: { id: string }) {
  const { res, openProject } = useApp()
  const p = React.use(res.get(projectLatestKey(id), () => projectLatest(id)))
  if (p === FAILED || p.year === undefined || !p.kind) return <LoadFailed />
  const year = p.year
  const frame = (p.cofog ? frameOf(p.cofog) : undefined) ?? OTHER_FRAME
  const rows = Object.keys(p.y).map(Number).sort((a, b) => b - a)
  const graded = Object.keys(p.grades ?? {}).length > 0
  return (
    <>
      <ProjectTitle p={p} mark={p.ended != null ? 'stop' : p.started === year ? 'new' : null} />
      <div className="flex flex-wrap gap-2">
        <Chip><FieldIcon id={frame.id} />{frame.name}</Chip>
      </div>
      <DetailSection icon={CalendarBlankIcon} title="年度ごと">
        {/* 評価シートのある年度は、その年度の行に評価（A〜D）を並べる。評価が一つも無ければ列を出さない */}
        <div className={cn('grid max-w-xl text-sm', graded ? 'grid-cols-[auto_1fr_1fr_auto]' : 'grid-cols-[auto_1fr_1fr]')}>
          <span className="py-2 text-xs" /><span className="py-2 text-right text-xs text-muted-foreground">当初予算</span><span className="px-1 py-2 text-right text-xs text-muted-foreground">決算</span>
          {graded ? <span className="px-2 py-2 text-center text-xs text-muted-foreground">評価</span> : null}
          {rows.map((y) => (
            <div key={y} className={cn('col-span-full grid grid-cols-subgrid', y === year && 'bg-card')}>
              <Separator className="col-span-full" />
              <span className="px-1 py-2">{r(y)}</span>
              <span className="py-2 text-right"><SourceAmt yen={p.y[String(y)]?.b} href={p.src?.[String(y)]?.b} label={`${r(y)}年度の当初予算の出典`} /></span>
              <span className="px-1 py-2 text-right"><SourceAmt yen={p.y[String(y)]?.s} href={p.src?.[String(y)]?.s} label={`${r(y)}年度の決算の出典`} /></span>
              {graded ? <span className="px-2 py-2 text-center"><GradeLink grade={p.grades?.[String(y)]} href={p.gradeSrc?.[String(y)]} label={`${r(y)}年度の事業評価の評価シート`} /></span> : null}
            </div>
          ))}
        </div>
      </DetailSection>
      {p.kids.length ? (
        <DetailSection icon={TreeStructureIcon} title="内訳">
          {/* 内訳の一つ一つも年度をまたぐ事業なので、押すとその事業の頁へ移る。額はその事業の最新の年度のもの */}
          <Infinite items={p.kids} step={10} list={(kids) => (
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 font-normal">事業名</TableHead>
                  <TableHead className="h-9 font-normal">年度</TableHead>
                  <TableHead className="h-9 text-right font-normal">金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kids.map((k, i) => (
                  <TableRow key={k.id ?? i} onClick={() => k.id && openProject(k.id)} className="cursor-pointer hover:bg-card">
                    <TableCell className="whitespace-normal py-3 [overflow-wrap:anywhere]">
                      <button type="button" className="rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">{k.name}</button>
                    </TableCell>
                    <TableCell className="py-3 text-muted-foreground">{k.fy != null ? `${r(k.fy)} ${k.kind === 'initial' ? '当初予算' : '決算'}` : ''}</TableCell>
                    <TableCell className="py-3 text-right tabular-nums">{k.yen == null ? '—' : yenText(k.yen)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )} />
        </DetailSection>
      ) : null}
    </>
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
      <DropdownMenuTrigger render={<Button size="sm" className="h-8 rounded-full px-3 text-sm font-normal" />}>
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
  { key: 'money', label: '予算', icon: WalletIcon },
  { key: 'settled', label: '決算', icon: ReceiptIcon },
]

const TAB_SEGMENT = new RegExp(`/(${Object.values(TAB_SLUGS).join('|')})/?$`)
/** 今の URL から年度・タブ・分野の段を除いた、自治体の頁の path */
const basePath = () => location.pathname.replace(PROJECT_PATH, '').replace(TAB_SEGMENT, '').replace(/\/\d{4}\/?$/, '')
/** 事業の頁の段（/projects/<project_id>） */
const PROJECT_PATH = /\/projects\/([^/]+)\/?$/
/** 今の URL の事業の頁の事業の ID */
const projectOfPath = () => {
  const m = location.pathname.match(PROJECT_PATH)?.[1]
  return m ? decodeURIComponent(m) : null
}
/** 事業の頁の URL の段 */
const projectSegment = (id: string) => `projects/${encodeURIComponent(id)}`

export function AppPage({ res, data, snapshot: base, flow, extras: extrasProp, setsu, sitekey, initialProject, initialTab }: { /** 頁のデータの置き場。Suspense の外で作って渡す（初めて描く前に止まると、中で作った state は捨てられて読み直しが繰り返される） */ res: Resources; data: PageData; /** 開いた年度の頁のデータ。年度・タブを移ると loader が読み直して渡す */ snapshot: Snapshot; flow?: PageFlow; /** loader が defer で渡す残り（評価シート・お金のかかる事業・新しく始めた事業） */ extras?: Promise<YearExtras>; /** loader が defer で渡す流れの節 */ setsu?: Promise<Record<string, Setsu[]>>; sitekey: string; /** 事業の頁（/2026/projects/<project_id>）で開いた事業 */ initialProject?: string; initialTab?: TabKey }) {
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
  /** 年度・タブの頁の URL。リンクの先にして検索エンジンにも辿らせる。まとめは年度の段を持たない（最新の年度を出す） */
  const pageHref = (y: number, t: TabKey) => (t === 'overview' ? data.path : `${data.path}/${y}/${TAB_SLUGS[t]}`)
  // 年度・タブを移っても、選んでいる状態とスクロールは持ち越す。タブは履歴に積み、戻るで前のタブとそのスクロールへ帰す。年度・会計は置き換える
  const move = (href: string, { push = false } = {}) => void router.visit(href, { replace: !push, preserveState: true, preserveScroll: true })
  // 年度のリンクは今のタブを引き継ぐ（予算・決算のタブはどの年度にもある）。分野の頁なら同じ分野のまま年度を移る
  const yearHref = (y: number) => pageHref(y, tab)
  const setYear = (y: number) => {
    if (y === year) return
    move(yearHref(y))
  }
  const setTab = (t: TabKey, { push = true, query = '' } = {}) => {
    setTabState(t)
    if (t !== at.current.tab || projectOfPath()) move(pageHref(at.current.year, t) + query, { push })
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
  const [query, setQueryState] = React.useState('')
  const setQuery = (x: string) => React.startTransition(() => setQueryState(x))
  // 事業の絞り込み（?filter=・?field=・探す語の ?q=）は URL に持つ。ホームやまとめの札から開いた状態で来られ、
  // 事業の頁を開いて戻ったときも URL から戻せる。まとめ（/tokyo/nakano）と事業のタブ（/2024/projects）は頁が別で、移ると画面を作り直すので、go も URL で渡す
  // 頁を移る途中は URL がまだ前の頁のままなので、移り終えてから読む
  const idle = navigation.state === 'idle'
  React.useEffect(() => {
    if (!idle) return
    const q = new URLSearchParams(location.search)
    const f = q.get('filter')
    if (f && ['all', 'new', 'ended'].includes(f)) setFilter(f)
    const field = q.get('field')
    if (field) setFields(field.split(','))
    if (q.has('q')) setQuery(q.get('q')!.trim())
  }, [initialTab, idle])
  // 事業の頁。URL を /projects/<project_id>（年度の段なし）にして、戻るで前の頁へ帰る。中身は事業の ID で読む
  const [projectPage, setProjectPage] = React.useState<string | null>(initialProject ?? null)
  const openProject = (id: string) => {
    // depth は事業の頁を続けて開いた数、fromList はその始まりが事業のタブだったか。事業のタブへ戻るときに、始まりが事業のタブならその数だけ履歴を戻る
    const state = history.state as ProjectHistory | null
    const next: ProjectHistory = state?.project
      ? { project: id, depth: (state.depth ?? 1) + 1, fromList: !!state.fromList }
      : { project: id, depth: 1, fromList: tab === 'projects' && !projectPage }
    history.pushState({ ...state, ...next }, '', `${basePath()}/${projectSegment(id)}`)
    React.startTransition(() => setProjectPage(id))
    window.scrollTo({ top: 0 })
  }
  const closeProject = () => {
    // 事業のタブから開いたなら履歴を戻る（探す語・絞り込み・スクロールが戻る）。他のタブや事業の頁を直に開いたときは事業のタブへ移る
    const state = history.state as ProjectHistory | null
    if (state?.project && state.fromList) return history.go(-(state.depth ?? 1))
    setProjectPage(null)
    setTabState('projects')
    void router.visit(pageHref(year, 'projects'), { preserveState: true })
    window.scrollTo({ top: 0 })
  }
  React.useEffect(() => {
    // 戻る・進むでは、URL の事業に画面を合わせる（年度・タブは移った頁の loader が渡す）
    const onPop = () => setProjectPage(projectOfPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // 事業のタブの絞り込みを URL に書き写す（履歴は積まない）。事業の頁を開くと、その前の URL が絞り込みつきで履歴に残る
  React.useEffect(() => {
    if (!idle || tab !== 'projects' || projectPage || projectOfPath()) return
    const q = new URLSearchParams(location.search)
    const set = (k: string, x: string) => (x ? q.set(k, x) : q.delete(k))
    set('q', query)
    set('filter', filter === 'all' ? '' : filter)
    set('field', fields.join(','))
    const next = location.pathname + (q.size ? `?${q}` : '') + location.hash
    if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', next)
  }, [idle, tab, projectPage, query, filter, fields.join()])
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
  // タブの頭の年度の切り替えがタブの帯の下に隠れたら、帯の中に同じ切り替えを出して画面に残す。
  // スマホのタブは Carousel（overflow: hidden）の中にあり sticky が効かないので、帯の側に出す
  const stickyBar = React.useRef<HTMLDivElement>(null)
  const [yearStuck, setYearStuck] = React.useState(false)
  React.useEffect(() => {
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bar = stickyBar.current?.getBoundingClientRect().bottom ?? 0
        // 見えているタブの切り替えだけ（隠れたタブは幅が 0、スマホの隣のタブは画面の横の外）
        const heads = [...document.querySelectorAll<HTMLElement>('[data-tab-year]')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.right > 0 && r.left < innerWidth)
        setYearStuck(heads.length > 0 && heads.every((r) => r.bottom <= bar))
      })
    }
    check()
    addEventListener('scroll', check, { passive: true })
    addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener('scroll', check)
      removeEventListener('resize', check)
    }
  }, [tab, year, projectPage])
  const go: Go = (t, opt = {}) => {
    // タブと同じ描画で絞り込みも変える。transition で後から変えると、先に絞らない一覧が描かれてその続きの頁まで読みに行き、
    // 絞った一覧も頁の移動（loader）が終わるまで出ない
    if (opt.filter) setFilterState(opt.filter)
    if (t === 'projects') setFieldsState(opt.field ? [opt.field] : [])
    const q = new URLSearchParams(Object.entries(opt).filter((e): e is [string, string] => !!e[1]))
    changeTab(t, t === 'projects' && (opt.filter || opt.field) ? `?${q}` : undefined)
  }
  // 分野（何に使う？の棒・入る→使うの分野）を押したら、その分野で絞った事業のタブへ移る
  const openField = (id: string) => go('projects', { field: id })

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
  const carouselOpts = React.useMemo(() => ({ startIndex: index, watchDrag: startsTabSwipe }), [phone])
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
    // 事業の頁から戻ると Carousel が作り直されるので、新しいスライドを測り直す
  }, [phone, index, v, projectPage])

  const header = (
    <header className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 py-7 sm:grid-cols-[108px_minmax(0,1fr)] sm:gap-6">
      <div className="grid size-20 place-items-center rounded-xl border bg-emblem p-3 sm:size-[108px] sm:rounded-2xl sm:p-4">
        {emblem ? <img src={emblem} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <span className={cn(titleVariants({ size: 'display' }), 'font-normal text-foreground')}>{data.name[0]}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {/* 年度の切り替えは、まとめ以外のタブの見出しの横に置く（まとめには置かない） */}
        <Title size="h2" as="h1" className="min-w-0 font-normal">{data.name}</Title>
        {vision ? <p className="mt-2 text-base leading-snug sm:mt-0 sm:text-base">{vision}</p> : null}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-2 whitespace-nowrap text-xs text-muted-foreground sm:gap-x-6 sm:text-sm">
          <span className="inline-flex items-center gap-1 sm:gap-2"><MapPinIcon className="size-3.5 sm:size-4" aria-hidden="true" />{data.prefecturePath ? <Button variant="link" size="inline" nativeButton={false} render={<Link href={data.prefecturePath} />}>{data.prefecture}</Button> : data.prefecture}</span>
          {data.population ? (
            <Hint label={`住民基本台帳人口（${formatAsOf(data.population.asOf)}時点）`}>
              <span className="inline-flex items-center gap-1 text-foreground sm:gap-2"><UsersIcon className="size-3.5 text-muted-foreground sm:size-4" aria-hidden="true" /><span className="sr-only">人口 </span>{formatPeople(data.population.people)}</span>
            </Hint>
          ) : null}
          {data.officialUrl ? <span className="inline-flex items-center gap-1 sm:gap-2"><GlobeIcon className="size-3.5 sm:size-4" aria-hidden="true" /><Button variant="link" size="inline" nativeButton={false} render={<a href={data.officialUrl} target="_blank" rel="noopener" />}>公式サイト</Button></span> : null}
        </div>
      </div>
    </header>
  )

  const panel = (key: TabKey) =>
    !v ? null : key === 'overview' ? <Overview /> : key === 'money' ? <MoneyTab key={v.year} phase="initial" /> : key === 'settled' ? <MoneyTab key={v.year} phase="settlement" /> : <ProjectsTab filter={filter} setFilter={setFilter} fields={fields} setFields={setFields} q={query} setQ={setQuery} />

  return (
    <div className="@container">
      <div className="mx-auto max-w-[1120px] px-4 pb-48">
        {header}
        <Separator />
        <Tabs value={tab} onValueChange={(t) => changeTab(t as TabKey)} className="gap-0">
          <div ref={tabsTop} aria-hidden="true" />
          {/* 区切りの線は画面の端から端まで引く（50cqw は外側の幅の半分、50% は中身の幅の半分。px で文字の位置は中身に揃える） */}
          <div ref={stickyBar} className="sticky top-0 z-20 mx-[calc(50%-50cqw)] px-[calc(50cqw-50%)] bg-background">
            {/* 下線を区切りの線に重ねて、線が二重に見えないようにする */}
            <Separator className="absolute inset-x-0 bottom-0 data-horizontal:w-auto" />
            {/* スクロールしたら上にタブを残す。下に Separator を引いて中身と分ける */}
            <div className="flex items-center gap-3">
            {projectPage ? (
              <div className="relative z-10 flex h-12 min-w-0 flex-1 items-center sm:h-[52px]">
                {/* 入れ子の事業は上の事業をパンくずに並べる。分かるまでは事業のタブへ戻るボタンを出しておく */}
                <ClientSuspense fallback={<ProjectCrumbs label="事業" close={closeProject} open={openProject} ancestors={[]} />}>
                  <ProjectBack res={res} id={projectPage} label="事業" close={closeProject} open={openProject} />
                </ClientSuspense>
              </div>
            ) : (
            <TabsList variant="line" className="relative z-10 min-w-0 flex-1 justify-start gap-2 overflow-x-auto p-0 [scrollbar-width:none] group-data-horizontal/tabs:h-12 sm:gap-4 sm:group-data-horizontal/tabs:h-[52px]">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} nativeButton={false} render={<a href={pageHref(year, t.key)} />} onClick={(e) => (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ? e.preventBaseUIHandler() : e.preventDefault())} className="no-underline h-full flex-none gap-2 px-3 py-0 has-data-[icon=inline-start]:pl-3 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 focus-visible:text-foreground text-sm leading-none data-active:text-primary data-active:hover:text-primary data-active:focus-visible:text-primary dark:data-active:text-primary group-data-horizontal/tabs:after:-bottom-[0.5px] group-data-horizontal/tabs:after:h-[2.5px] after:bg-primary sm:text-base">
                  <t.icon data-icon="inline-start" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            )}
            </div>
            {/* 帯の高さを変えると中身がずれて出し入れが揺れるので、帯の下に重ねて出す（幅は帯と同じく画面の端から端まで） */}
            {yearStuck && v ? (
              <div className="relative h-0">
              <div className="absolute inset-x-0 top-0 mx-[calc(50%-50cqw)] flex h-12 items-center justify-between gap-3 border-b bg-background px-[calc(50cqw-50%)]">
                <span className="truncate text-sm font-semibold">{projectPage ? '' : TABS.find((t) => t.key === tab)?.label}</span>
                <div className="shrink-0">
                  <div className="md:hidden"><YearMenu years={years} current={v.year} onChange={setYear} /></div>
                  <div className="max-md:hidden"><YearPicker years={years} current={v.year} onChange={setYear} hrefOf={yearHref} /></div>
                </div>
              </div>
              </div>
            ) : null}
          </div>
          {v ? (
            <AppContext.Provider value={{ d, page: data, years, v, res, openProject, go, openField, flow, flowFailed, pickAccount, setsu, extras: extrasProp, prevFieldSubjects, setYear, yearHref }}>
              {projectPage ? (
                <div key={projectPage} className="pt-6"><ProjectPage id={projectPage} /></div>
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

            </AppContext.Provider>
          ) : (
            <p className="pt-6 text-sm text-muted-foreground">データを読み込めませんでした。頁を読み込み直してください。</p>
          )}
        </Tabs>
      </div>
      <AskDock name={data.name} code={data.code} sitekey={sitekey} year={year} detail={() => (v ? (projectPage ? describeProject(res.peek<Loaded<ProjectFull>>(projectLatestKey(projectPage))) : '') : '')} section={TABS.find((t) => t.key === tab)?.label} />
    </div>
  )
}
