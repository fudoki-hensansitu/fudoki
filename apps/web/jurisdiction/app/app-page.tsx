// 自治体の頁（アプリ型）。ヘッダーの下を「予算・決算・事業・財政」のタブにし（予算・決算のタブはどの年度にも出す。自治体の頁そのものは最新の年度の予算を出す）。事業は一覧から事業の頁へ移る。
// 一覧は名前と金額だけを出し、説明は詳細にだけ出す。部品は shadcn/ui（Card・Input・ToggleGroup）
import * as React from 'react'
import { useNavigation, useRouter } from '@void/react'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
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
  ListDashesIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ArrowDownIcon,
  PiggyBankIcon,
  MapTrifoldIcon,
  MapPinAreaIcon,
  StorefrontIcon,
  StudentIcon,
  UsersIcon,
  WalletIcon,
  type Icon,
} from '@phosphor-icons/react'
import { MoreDots } from '@/components/more-dots'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
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
import { AskDock, type AskHandle, type PresetAnswer } from '../ask-dock'
import { appPageYears, formatAsOf, formatPeople, reiwa, yearName, type Drill, type Moku, type MokuBreakdowns, type PageData, type PageFlow, type YearTotal, TAB_SLUGS, FINANCE_SLUG, hasDocument, type PageTab } from '../types'
import { hasQuestions } from '../questions'
import { QuestionFeedView } from '../questions/feed'
import { Chip } from '../chip'
import { Mark as BrandMark } from '../../nav/site-nav'
import type { Question, QuestionFeed } from '../questions/types'
import { Title, titleVariants } from '@/components/ui/title'
import { withExtras, yearView, type AccountTotal, type Proj, type Snapshot, type YearExtras, type YearView } from './data'
import { fieldSubjects, listKey, listPage, projectLatest, type ListPage, type ListQuery, type ProjectFull } from './api'
import { ClientSuspense, FAILED, Resources, type Loaded } from './resource'
import { Amt, yenParts } from './amount'
import { FinanceSections } from './finance'
import { IncomeFlow } from './income-flow'
import { setsuGroups, type SetsuGroup } from '../setsu-groups'
import { MoneyDetail, type MoneyDetailKey } from './money-detail'
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
type Ctx = { d: Snapshot; page: PageData; years: number[]; v: YearView; res: Resources; /** 事業の頁へ移る */ openProject: (id: string) => void; go: Go; openField: (id: string) => void; /** 予算・決算のタブの頁で loader が読んだ流れ */ flow?: PageFlow; /** 予算・決算のタブの頁なのに流れを読めなかった（API に繋がらなかった） */ flowFailed: boolean; /** 流れの会計を変える（?account= の頁へ移る） */ pickAccount: (account: string) => void; /** loader が defer で渡す流れの節 */ setsu?: Promise<MokuBreakdowns>; /** loader が defer で渡す残り（評価シート・お金のかかる事業）。useFullView が use() で待つ */ extras?: Promise<YearExtras>; prevFieldSubjects?: Record<string, string[]>; /** 年度を移る（タブの見出しの年度の切り替え） */ setYear: (y: number) => void; /** 年度の頁の URL（今のタブのまま） */ yearHref: (y: number) => string }
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
/** 財政以外の頁の頭。頁の名前と年度の切り替えは上の帯に出すので、ここはその言葉の意味の一文だけ */
function TabHead({ children }: { children: React.ReactNode }) {
  return <p className="mb-5 min-w-0 text-base leading-[1.7] text-muted-foreground">{children}</p>
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

/** 事業の頁の URL（/tokyo/shinagawa/projects/<project_id>）。base は自治体の頁の path（PageData.path）。事業は年度をまたぐので年度の段を持たない */
const projectHref = (base: string, id: string) => `${base}/${TAB_SLUGS.projects}/${encodeURIComponent(id)}`

/** 事業の頁へのリンク。検索エンジンが辿れるよう href を持たせ、ふつうに押したときは行の onClick（画面の中で開く）に任せる。
 * 修飾キー・中ボタンで押したときはブラウザに任せ（新しいタブ）、行の onClick に渡さない */
function ProjectLink({ id, children }: { id: string; children: React.ReactNode }) {
  const { page } = useApp()
  return (
    <a
      href={projectHref(page.path, id)}
      onClick={(e) => (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ? e.stopPropagation() : e.preventDefault())}
      className="rounded-sm text-left text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </a>
  )
}

/** 事業の名前の欄。新しく始める・やめた事業の印は事業名の後ろに付ける。分野・評価は広い幅の列だけに出し、狭い幅では名前の下に添えない（情報が増えないため） */
function ProjectNameCell({ p }: { p: Proj }) {
  const { v } = useApp()
  const ended = v.isEnded(p)
  return (
    // 文節で折り返す設定のままだと、長い事業名が狭い幅で列を押し広げるので、収まらないときは文節の途中でも折り返す
    <span className="block [overflow-wrap:anywhere]">
      {/* 押せることとフォーカスは事業名のリンクが持つ（行を押しても同じく詳細を開く）。目を事業の代わりにした行（moku:）は押せない */}
      {p.id.startsWith('moku:') ? <span>{p.name}</span> : <ProjectLink id={p.id}>{p.name}</ProjectLink>}
      {ended || v.isNew(p) ? <span className="ml-2 inline-flex align-middle">{ended ? <Mark kind="stop" label="やめた事業" className="size-5" /> : <Mark kind="new" label="新しく始める事業" className="size-5" />}</span> : null}
    </span>
  )
}
function ProjectFieldCell({ p }: { p: Proj }) {
  const { v } = useApp()
  return <span className="inline-flex items-center gap-2"><FieldIcon id={v.fieldOf(p)} className="size-4 shrink-0 text-muted-foreground" />{fieldName(v, v.fieldOf(p))}</span>
}

/** 事業の表（shadcn の data table）。並びは api が返した金額の多い順のまま。行を押すと詳細を開く。文字は見出しも中身もすべて本文の大きさ・同じ色にする */
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
    <Table>
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
function FieldRow({ f, i, max, total, onClick, grow = true }: { f: { name: string; yen: number }; i: number; max: number; /** 割合の分母。無ければ一般会計の総額 */ total?: number; /** 無ければ押せない行にする */ onClick?: () => void; /** 棒を伸ばすアニメーションを出す */ grow?: boolean }) {
  const { v } = useApp()
  const pct = (f.yen / (total ?? v.total)) * 100
  const Row = onClick ? 'button' : 'div'
  return (
    <Row {...(onClick ? { type: 'button' as const, onClick } : {})} className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-3 py-3 text-left sm:grid-cols-[10rem_minmax(0,1fr)_5.5rem]', onClick && 'transition-colors hover:bg-card')}>
      {/* 名前は切らずに折り返す */}
      <span className="col-start-1 row-start-1 min-w-0 text-base font-medium sm:col-start-auto sm:row-start-auto">{f.name}</span>
      <span className="col-span-2 col-start-1 row-start-2 block h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:col-start-auto sm:row-start-auto">
        <span className={cn(grow && 'app-grow', 'block h-full rounded-full bg-primary')} style={{ width: `${Math.max(1, (f.yen / max) * 100)}%`, animationDelay: `${i * 30}ms` }} />
      </span>
      {/* 割合の下に金額。金額はすでに小さい文字なので、単位も同じ大きさにする */}
      <span className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
        <span className="block text-base tabular-nums">
          {pct.toFixed(1)}
          <small className="text-xs text-muted-foreground">%</small>
        </span>
        <Amt yen={f.yen} plainUnit className="block text-xs text-muted-foreground" />
      </span>
    </Row>
  )
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
const withSetsu = (flow: PageFlow, byMoku: MokuBreakdowns): PageFlow => {
  const moku = (m: Moku): Moku => ({ ...m, setsu: byMoku.setsu[m.id] ?? m.setsu, ...(byMoku.projects[m.id] ? { projects: byMoku.projects[m.id] } : {}) })
  const drills = (ds: Drill[]) => ds.map((k) => ({ ...k, kou: k.kou.map((o) => ({ ...o, moku: o.moku.map(moku) })) }))
  return { ...flow, drills: drills(flow.drills), loose: flow.loose.map(moku), ...(flow.revenue ? { revenue: drills(flow.revenue) } : {}) }
}

function MoneyTab({ phase, active }: { phase: 'initial' | 'settlement'; /** 開いているタブか。スマホは隣のタブも描くので、URL を書き換えるのは開いているタブだけにする */ active: boolean }) {
  const { v, d, res, page, flow, flowFailed, pickAccount, setsu: setsuProp, openField, openProject, setYear, yearHref } = useApp()
  const y = d.years[String(v.year)]
  const total: YearTotal | undefined = y?.kind === phase ? { year: v.year, yen: y.total, kan: [] } : undefined
  // 収録はあるが、今の頁のデータが別の資料（スマホで隣のタブを開いた頁など）なら、タブへ移って loader が読むまで待つ
  const recorded = hasDocument(page, v.year, phase)
  const label = phase === 'initial' ? '当初予算' : '決算'
  // 収録の無い年度から移る先。同じ資料を収録している一番近い年度（同じ近さなら新しい方）
  const nearby = recorded ? undefined : (phase === 'initial' ? page.initialYears : page.settlementYears).toSorted((a, b) => Math.abs(a - v.year) - Math.abs(b - v.year) || b - a)[0]
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
  const [setsu, setSetsu] = React.useState<{ key: string; byMoku: MokuBreakdowns | typeof FAILED }>()
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
  // 開いている会計の目（節つき）。何に使う？と詳細の引き出しが使う
  const allMoku = React.useMemo(() => (current ? [...current.drills.flatMap((k) => k.kou.flatMap((o) => o.moku)), ...current.loose] : []), [current])
  // 目の無い項・款は、目の代わりに節の分からない分として数え、何に使う？の総額を会計の総額に揃える
  const units = React.useMemo(() => (current ? [
    ...current.drills.flatMap((k): Moku[] => (k.kou.length ? k.kou.flatMap((o): Moku[] => (o.moku.length ? o.moku : o.amountMissing ? [] : [{ id: o.id, name: o.name, yen: o.yen, setsu: [], path: [k.kan.name, null] }])) : k.kan.amountMissing ? [] : [{ id: k.kan.id, name: k.kan.name, yen: k.kan.yen, setsu: [] }])),
    ...current.loose,
  ] : []), [current])
  // 節で分けた額。節の分かる額が総額の半分に満たない（目の内訳が節でない資料が多い）ときは出さない
  const setsuView = React.useMemo(() => {
    if (!byMoku || byMoku === FAILED) return undefined
    const { groups, known, total } = setsuGroups(units)
    return total > 0 && known >= total * 0.5 ? { groups, total } : undefined
  }, [units, byMoku])
  // 詳細の引き出し（入る→使うの分野・何に使う？の区分）。入る→使うは一般会計なので、ほかの会計を開いているときは分野を押したら事業のタブへ移る
  const [detail, setDetail] = React.useState<MoneyDetailKey>()
  const wide = useMedia('(min-width: 768px)')
  const projectLink = React.useMemo(() => ({ href: (id: string) => projectHref(page.path, id), open: openProject }), [page.path, openProject])
  const openFieldDetail = (id: string) => (current?.account === GENERAL ? setDetail({ kind: 'field', id }) : openField(id))
  const router = useRouter()
  const accounts = d.accounts ?? []
  // 会計の総額は頁のデータの資料のもの。別の資料のタブ（スマホで隣に並ぶタブ）では使わない
  const special = account === GENERAL || !total ? undefined : accounts.find((x) => x.name === account)
  const picked: YearTotal | undefined = special ? { year: v.year, yen: special.yen, kan: [] } : total
  // お金の流れの見せ方（初めはテーブル）と表の探す語は URL に持つ（?flow=sankey・歳出の ?exp_q=・歳入の ?rev_q=）。履歴は積まない
  const [view, setView] = React.useState<'sankey' | 'table'>('table')
  const [flowQuery, setFlowQuery] = React.useState<FlowQuery>({ expenditure: '', revenue: '' })
  // URL を読み終えるまでは書き換えない（読む前の初めの値で URL の探す語を消さないように）
  const [urlRead, setUrlRead] = React.useState(false)
  React.useEffect(() => {
    const q = new URLSearchParams(location.search)
    const found = { expenditure: q.get('exp_q') ?? '', revenue: q.get('rev_q') ?? '' }
    setFlowQuery(found)
    if (q.get('flow') === 'sankey' && !found.expenditure && !found.revenue) setView('sankey')
    setUrlRead(true)
  }, [])
  React.useEffect(() => {
    if (!active || !urlRead) return
    const q = new URLSearchParams(location.search)
    const set = (k: string, x: string) => (x ? q.set(k, x) : q.delete(k))
    const table = view === 'table'
    set('flow', table ? '' : 'sankey')
    set('exp_q', table ? flowQuery.expenditure.trim() : '')
    set('rev_q', table ? flowQuery.revenue.trim() : '')
    const next = location.pathname + (q.size ? `?${q}` : '') + location.hash
    if (next !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', next)
  }, [active, urlRead, view, flowQuery])
  return (
    <div className="flex flex-col gap-3">
      <TabHead>
        {phase === 'settlement'
          ? '決算は、1年間に実際に入ったお金と使ったお金を、年度が終わった後にまとめたものです。議会の認定を受けて確定します。'
          : '予算は、1年間に何にいくら使うかを、年度が始まる前に決めた計画です。議会の議決を経て決まります。ここでは、年度の初めに決めた当初予算を扱います。'}
      </TabHead>
      {/* 入る→使う（一般会計の歳入と歳出の総額と流れ）。その年度・資料の歳入を収録しているときだけ */}
      {total && revenueDoc ? <IncomeFlow doc={revenueDoc} revenue={current?.revenue} phase={phase} expTotal={total.yen} fields={v.fields} pop={d.pop} openField={openFieldDetail} /> : null}
      {/* 使い道の分野は入る→使うに出るので、ここは節で分けた「何に使う？」。節が載っていない資料では出さない（節は描いた後に届くので、届くまでは枠だけ） */}
      {total && setsuView ? <SetsuSection phase={phase} account={account} groups={setsuView.groups} total={setsuView.total} onOpen={(id) => setDetail({ kind: 'setsu', id })} /> : total && shown && byMoku === undefined ? <SetsuSection phase={phase} account={account} /> : null}
      {total ? (
        <div className="flex items-center justify-between gap-3">
          <Title size="h3" as="h2">お金の流れ</Title>
          <ToggleGroup aria-label="お金の流れの見せ方" value={[view]} onValueChange={(v) => { if (v[0]) setView(v[0] as typeof view) }} spacing={0} className="grid shrink-0 grid-cols-2 rounded-full bg-secondary p-1">
            <ToggleGroupItem value="table" className="w-full rounded-full! px-3">
              <TableIcon aria-hidden="true" />テーブル
            </ToggleGroupItem>
            <ToggleGroupItem value="sankey" className="w-full rounded-full! px-3">
              <ArrowsSplitIcon aria-hidden="true" className="-rotate-90" />サンキー
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}
      {total ? <AccountCards accounts={accounts} account={account} setAccount={setAccount} /> : null}
      {picked && view === 'table' ? (
        <FlowTable key={`${v.year}-${phase}-${account}`} flows={flows} revenue={current?.revenue} total={picked.yen} query={flowQuery} onQuery={(k, x) => setFlowQuery((f) => ({ ...f, [k]: x }))} onSetsu={(id) => setDetail({ kind: 'setsuItem', id })} project={projectLink} onRetry={flowFailed && !drills ? () => void router.refresh({ preserveState: true, preserveScroll: true }) : undefined} />
      ) : picked ? (
        <Flow key={`${v.year}-${phase}-${account}`} flows={flows} revenue={current?.revenue} total={picked} onSetsu={(id) => setDetail({ kind: 'setsuItem', id })} onRetry={flowFailed && !drills ? () => void router.refresh({ preserveState: true, preserveScroll: true }) : undefined} bare natural className="scroll-mt-16 @4xl:scroll-mt-16" />
      ) : recorded ? (
        <FlowSkeleton />
      ) : (
        <Empty className="min-h-[320px] border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-11 rounded-full text-muted-foreground [&_svg:not([class*='size-'])]:size-6">
              <FileDashedIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-base">{reiwa(v.year)}の{label}はまだ収録していません</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            {nearby !== undefined ? (
              <Button nativeButton={false} render={<a href={yearHref(nearby)} />} onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); setYear(nearby) }} className="rounded-full px-4 no-underline">
                {reiwa(nearby)}の{label}を見る
              </Button>
            ) : null}
            <RequestTown className="text-sm text-muted-foreground">{label}の収録をリクエストする</RequestTown>
          </EmptyContent>
        </Empty>
      )}
      {byMoku === FAILED ? <p className="text-xs text-muted-foreground">目の内訳（節）を読み込めませんでした。少し待ってから開き直してください。</p> : null}
      <MoneyDetail open={detail} onClose={() => setDetail(undefined)} wide={wide} moku={allMoku} units={units} fields={v.fields} groups={setsuView?.groups ?? []} onProjects={(f) => { setDetail(undefined); openField(f) }} />
    </div>
  )
}

/** 何に使う？／何に使った？（歳出を節でまとめた区分ごとに）。予算・決算のタブのお金の流れの上に置く。押すと区分の詳細の引き出しを開く。
 * 節は描いた後に届くので、届くまで（groups が無い間）は見出しと説明をそのまま出し、棒の行だけを同じ形の skeleton にする */
function SetsuSection({ phase, account, groups, total, onOpen }: { phase: 'initial' | 'settlement'; account: string; groups?: SetsuGroup[]; total?: number; /** 区分の詳細を開く */ onOpen?: (id: string) => void }) {
  const max = groups ? Math.max(...groups.map((g) => g.yen)) : 0
  const n = groups?.length ?? SETSU_SKELETON.length
  return (
    <section className="mb-5">
      <Title size="h3" as="h2" className="mb-3">
        {phase === 'initial' ? '何に使う？' : '何に使った？'}
      </Title>
      <p className="mb-3 text-base leading-[1.7] text-muted-foreground">{account}の歳出を、人件費・委託料・工事など、お金の出し方で分けています。予算書・決算書の「節」をまとめたものです。</p>
      <div className="grid gap-x-8 @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-(--rows)" style={{ '--rows': `repeat(${Math.ceil(n / 2)}, auto)` } as React.CSSProperties}>
        {groups ? groups.map((g, i) => <FieldRow key={g.id} f={g} i={i} max={max} total={total} onClick={onOpen && (() => onOpen(g.id))} />) : SETSU_SKELETON.map((w, i) => <FieldRowSkeleton key={i} width={w} />)}
      </div>
    </section>
  )
}

/** お金の流れを読み込む間。見出しはそのまま出し、表（款の行の名前・金額・割合）の形だけを skeleton にする */
function FlowSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* 見出しの行は、読み込み後に右へ並ぶ切り替え（テーブル／サンキー）と同じ高さを取っておく */}
      <div className="flex h-10 items-center"><Title size="h3" as="h2">お金の流れ</Title></div>
      <div aria-hidden="true">
      {[10, 7, 9, 6, 8, 5, 7, 6].map((w, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-4">
          <Skeleton className="h-5" style={{ width: `${w}em` }} />
          <Skeleton className="ml-auto h-5 w-24" />
          <Skeleton className="hidden h-5 w-12 sm:block" />
        </div>
      ))}
      </div>
    </div>
  )
}

/** 何に使う？の skeleton の棒の長さ（%）。区分は大きい順に並ぶので、だんだん短くする */
const SETSU_SKELETON = [100, 72, 55, 40, 30, 22, 15, 10, 6]
/** FieldRow と同じ格子で、名前・棒・割合と金額の場所を skeleton にする */
function FieldRowSkeleton({ width }: { width: number }) {
  return (
    <div aria-hidden="true" className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-3 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_5.5rem]">
      <Skeleton className="col-start-1 row-start-1 h-5 w-20 sm:col-start-auto sm:row-start-auto" />
      <span className="col-span-2 col-start-1 row-start-2 block h-1.5 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
        <Skeleton className="h-full rounded-full" style={{ width: `${width}%` }} />
      </span>
      <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 sm:col-start-auto sm:row-start-auto">
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-3 w-16" />
      </span>
    </div>
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

      {/* 借金と貯金・事業に回ったお金・財政の指標（市区町村は決算状況調、都道府県は地方財政状況調査。web の D1 から loader が頁のデータに入れる） */}
      <FinanceSections finance={page.finance} year={v.year} population={page.population} prefecture={page.code.slice(2, 5) === '000'} />
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
      <TabHead>事業は、自治体がお金を使って行う一つ一つの仕事です。</TabHead>
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
      <Title size="h3" className="mb-2 flex items-center gap-2"><I className="size-5 text-muted-foreground" aria-hidden="true" />{title}</Title>
      {children}
    </section>
  )
}
/** 事業の名前。新しく始める・やめた事業の印は名前の前に置き、名前の1行目の高さの真ん中に揃える（名前が折り返しても印は1行目の横） */
function ProjectTitle({ p, mark }: { p: Pick<ProjectFull, 'name'>; mark: 'new' | 'stop' | null }) {
  const m = mark === 'stop' ? <Mark kind="stop" label="やめた事業" className="size-7" /> : mark === 'new' ? <Mark kind="new" label="新しく始める事業" className="size-7" /> : null
  return (
    <Title size="h2" className="mb-2 flex items-start gap-2">
      {m ? <span className="flex h-[1lh] shrink-0 items-center">{m}</span> : null}
      <span className="min-w-0">{p.name}</span>
    </Title>
  )
}

/** 事業の頁を開いたときに history.state に持つもの */
type ProjectHistory = { project: string; depth?: number; fromList?: boolean }

const projectLatestKey = (id: string) => `project-latest:${id}`

/** 事業の頁の戻る先。事業のタブと、入れ子の上にある事業をすべてパンくずに並べ、押すとそこへ戻る */
function ProjectBack({ res, id, base, label, close, open }: { res: Resources; id: string; base: string; label: string; close: () => void; open: (id: string) => void }) {
  const p = React.use(res.get(projectLatestKey(id), () => projectLatest(id)))
  return <ProjectCrumbs base={base} label={label} close={close} open={open} ancestors={p === FAILED ? [] : (p.ancestors ?? [])} />
}
function ProjectCrumbs({ base, label, close, open, ancestors }: { base: string; label: string; close: () => void; open: (id: string) => void; ancestors: NonNullable<ProjectFull['ancestors']> }) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-sm sm:text-base">
        <BreadcrumbItem className="shrink-0">
          <BreadcrumbLink render={<button type="button" onClick={close} />} className="inline-flex cursor-pointer items-center gap-1"><ArrowLeftIcon className="size-4 shrink-0" aria-hidden="true" />{label}</BreadcrumbLink>
        </BreadcrumbItem>
        {ancestors.map((a) => (
          <React.Fragment key={a.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-[3em]">
              <BreadcrumbLink href={projectHref(base, a.id)} onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); open(a.id) }} className="min-w-0 cursor-pointer truncate">{a.name}</BreadcrumbLink>
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
  if (yen == null || !href) return <Amt yen={yen} />
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={`${label}（${yenText(yen)}）`} className="inline-flex items-center gap-1 text-foreground no-underline hover:text-primary hover:underline">
      <Amt yen={yen} />
      <ArrowSquareOutIcon className="size-3 text-muted-foreground" aria-hidden="true" />
    </a>
  )
}

/** 事業の頁（/tokyo/shinagawa/projects/<project_id>）。一覧の行・評価シート・分野の頁の事業から開く。事業は年度をまたぐので年度の段を持たず、
 * 金額は年度ごとの表で出す（大きな金額は出さない）。内訳（中の事業）は事業の最新の年度（決算があれば決算）のもの */
function ProjectPage({ id }: { id: string }) {
  const { res } = useApp()
  return (
    <ClientSuspense fallback={<RowsSkeleton n={4} />} ready={!!res.peek(projectLatestKey(id))}>
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
      {/* 分野のバッジは名前の上に置く（「気になる」の札と同じ並び） */}
      <div className="flex flex-wrap gap-2">
        <Chip><FieldIcon id={frame.id} />{frame.name}</Chip>
      </div>
      <ProjectTitle p={p} mark={p.ended != null ? 'stop' : p.started === year ? 'new' : null} />
      <DetailSection icon={CalendarBlankIcon} title="年度ごと">
        {/* 評価シートのある年度は、その年度の行に評価（A〜D）を並べる。評価が一つも無ければ列を出さない */}
        <div className={cn('grid max-w-xl text-base', graded ? 'grid-cols-[auto_1fr_1fr_auto]' : 'grid-cols-[auto_1fr_1fr]')}>
          <span className="py-2" /><span className="py-2 text-right text-muted-foreground">当初予算</span><span className="px-1 py-2 text-right text-muted-foreground">決算</span>
          {graded ? <span className="px-2 py-2 text-center text-muted-foreground">評価</span> : null}
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
        <DetailSection icon={ListDashesIcon} title="内訳">
          {/* 内訳の一つ一つも年度をまたぐ事業なので、押すとその事業の頁へ移る。額はその事業の最新の年度のもの */}
          <Infinite items={p.kids} step={10} list={(kids) => (
            <Table>
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
                      {k.id ? <ProjectLink id={k.id}>{k.name}</ProjectLink> : k.name}
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
      {/* 選んでいる年度を出すので、広い画面の年度の丸（選択中）と同じく緑地に白字にする。大きさは事業の絞り込みのボタンに揃える */}
      <DropdownMenuTrigger className={filterTrigger(true)}>
        {yearName(current)}
        <CaretDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
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
/** 聞く欄の文言。いま見ているタブのことを聞けると伝える（自治体の名前は頁の頭にあるので繰り返さない） */
const askLabel = (tab: TabKey) => (tab === 'questions' ? '気になることを質問' : `${{ money: '予算', settled: '決算', projects: '事業', overview: '財政' }[tab]}について質問`)
const TABS: { key: TabKey; label: string; icon: Icon }[] = [
  { key: 'money', label: '予算', icon: WalletIcon },
  { key: 'settled', label: '決算', icon: ReceiptIcon },
  { key: 'projects', label: '事業', icon: ListBulletsIcon },
  { key: 'overview', label: '財政', icon: PiggyBankIcon },
]

const TAB_SEGMENT = new RegExp(`/(${[...Object.values(TAB_SLUGS), FINANCE_SLUG].join('|')})/?$`)
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

export function AppPage({ res, data, snapshot: base, flow, extras: extrasProp, setsu, sitekey, initialProject, initialProjectFull, initialTab, questions: questionsProp }: { /** 頁のデータの置き場。Suspense の外で作って渡す（初めて描く前に止まると、中で作った state は捨てられて読み直しが繰り返される） */ res: Resources; data: PageData; /** 開いた年度の頁のデータ。年度・タブを移ると loader が読み直して渡す */ snapshot: Snapshot; flow?: PageFlow; /** loader が defer で渡す残り（評価シート・お金のかかる事業・新しく始めた事業） */ extras?: Promise<YearExtras>; /** loader が defer で渡す流れの節 */ setsu?: Promise<MokuBreakdowns>; sitekey: string; /** 事業の頁（/2026/projects/<project_id>）で開いた事業 */ initialProject?: string; /** 事業の頁で loader が読んだ事業の中身（サーバーでも事業の頁を描く） */ initialProjectFull?: ProjectFull; initialTab?: TabKey; /** 「気になる」のタブの頁で loader が読んだ問い */ questions?: QuestionFeed }) {
  // 最初の画面に要らない分（評価シート・お金のかかる事業・新しく始めた事業）は loader が defer で流し、使う部分が Full（Suspense と use()）で待つ
  const d = base
  const vision = data.vision?.text
  const emblem = data.emblem?.src ?? null
  const years = React.useMemo(() => appPageYears(data), [data])
  const router = useRouter()
  const navigation = useNavigation()
  // 事業の一覧の1頁目は、一覧の key で置き場に入れる（続きの頁を足した一覧は上書きしない）
  for (const [k, page] of Object.entries(d.lists)) if (!res.peek(k)) res.set(k, page)
  // 事業の頁の中身は、loader が読んだ分を置き場に入れ、サーバーでも本文とパンくずを描く
  if (initialProjectFull && !res.peek(projectLatestKey(initialProjectFull.id))) res.set(projectLatestKey(initialProjectFull.id), initialProjectFull)
  React.useEffect(() => rememberJurisdiction({ code: data.code, name: data.name, path: basePath() }), [data.code, data.name])
  const year = d.year
  // 年度・タブは頁の URL で、移るたびに loader が頁のデータを読み直す。タブは押したらすぐ切り替え、届いた頁のタブに合わせ直す
  const [tab, setTabState] = React.useState<TabKey>(initialTab ?? 'money')
  React.useEffect(() => setTabState(initialTab ?? 'money'), [initialTab, year])
  const at = React.useRef({ year, tab })
  at.current = { year, tab }
  /** 年度・タブの頁の URL。リンクの先にして検索エンジンにも辿らせる。財政は年度の段を持たない（/tokyo/shinagawa/finance） */
  const pageHref = (y: number, t: TabKey) => (t === 'overview' ? `${data.path}/${FINANCE_SLUG}` : t === 'questions' ? data.path : `${data.path}/${y}/${TAB_SLUGS[t]}`)
  // 問いは「気になる」のタブの頁でだけ loader が渡す。他のタブへ移っても、続きの問いに作り置きの答えで答えられるよう持っておく
  const [questions, setQuestions] = React.useState(questionsProp)
  React.useEffect(() => void (questionsProp && setQuestions(questionsProp)), [questionsProp])
  const ask = React.useRef<AskHandle>(null)
  const preset = React.useMemo(() => {
    if (!questions) return undefined
    const byId = new Map(questions.questions.map((q) => [q.id, q]))
    const byText = new Map(questions.questions.map((q) => [q.q, q]))
    // 続きの候補は問いの id なら問いの文に直す（文のままのものは AI に聞く）
    const follow = (q: Question) => q.follow.map((f) => byId.get(f)?.q ?? f)
    return (text: string): PresetAnswer | undefined => {
      const q = byText.get(text)
      return q ? { answer: q.answer, follow: follow(q), source: q.source } : undefined
    }
  }, [questions])
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
  // 会計を替えても、お金の流れの見せ方と表の探す語（?flow・?exp_q・?rev_q）は引き継ぐ
  const pickAccount = (account: string) => {
    const now = new URLSearchParams(location.search)
    const q = new URLSearchParams([...now].filter(([k]) => ['flow', 'exp_q', 'rev_q'].includes(k)))
    if (account !== GENERAL) q.set('account', account)
    move(pageHref(year, at.current.tab) + (q.size ? `?${q}` : ''))
  }
  // 予算・決算のタブの頁を読み終えたのに流れが無ければ、API に繋がらなかった
  const flowFailed = (initialTab === 'money' || initialTab === 'settled') && !flow && navigation.state === 'idle'
  // 絞り込みを変えたら一覧を読み直す。読み終えるまで前の一覧を出したままにする
  const [fields, setFieldsState] = React.useState<string[]>([])
  const [filter, setFilterState] = React.useState('all')
  const setFields = (f: string[]) => React.startTransition(() => setFieldsState(f))
  const setFilter = (f: string) => React.startTransition(() => setFilterState(f))
  const [query, setQueryState] = React.useState('')
  const setQuery = (x: string) => React.startTransition(() => setQueryState(x))
  // 事業の絞り込み（?filter=・?field=・探す語の ?q=）は URL に持つ。ホームの札などから開いた状態で来られ、
  // 事業の頁を開いて戻ったときも URL から戻せる。財政（/tokyo/nakano/finance）と事業のタブ（/2024/projects）は頁が別で、移ると画面を作り直すので、go も URL で渡す
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
    // タブと同じ描画で絞り込みも変える。transition で後から変えると、先に絞らない一覧が描かれてその続きの頁まで読みに行き、
    // 絞った一覧も頁の移動（loader）が終わるまで出ない
    if (opt.filter) setFilterState(opt.filter)
    if (t === 'projects') setFieldsState(opt.field ? [opt.field] : [])
    const q = new URLSearchParams(Object.entries(opt).filter((e): e is [string, string] => !!e[1]))
    changeTab(t, t === 'projects' && (opt.filter || opt.field) ? `?${q}` : undefined)
  }
  // 分野（何に使う？の棒・入る→使うの分野）を押したら、その分野で絞った事業のタブへ移る
  const openField = (id: string) => go('projects', { field: id })

  // 予算・決算・事業・財政は入口（/tokyo/shinagawa）から開く単体の頁にし、タブで切り替えない
  const hub = tab === 'questions' && !projectPage

  // 入口のまちの頭。画面の半分ほどを使ってまちを大きく見せ、予算・決算・事業・財政への入口を並べる
  const hl = data.headline
  const lead = hl?.budget ? { label: '予算', ...hl.budget } : hl?.settlement ? { label: '決算', ...hl.settlement } : undefined
  const people = data.population?.people
  /** その資料を収録した最新の年度（無ければ開いている年度） */
  const latestOf = (doc: 'initial' | 'settlement') => years.find((y) => hasDocument(data, y, doc)) ?? year
  const doors: { key: TabKey; sub: string; year: number }[] = [
    { key: 'money', sub: '何に使う予定か', year: latestOf('initial') },
    { key: 'settled', sub: '何に使ったか', year: latestOf('settlement') },
    { key: 'projects', sub: '一つ一つの使い道', year },
    { key: 'overview', sub: '借金と貯金', year },
  ]
  // 予算・決算の頁は流れを読むので開くまで数秒かかる。押した入口に読み込み中の印を出す
  const [opening, setOpening] = React.useState<TabKey | null>(null)
  React.useEffect(() => void (idle && setOpening(null)), [idle])
  const hero = (
    <section className="flex min-h-[50svh] flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="grid size-28 place-items-center rounded-2xl border bg-emblem p-4 sm:size-36 sm:rounded-3xl sm:p-5">
        {emblem ? <img src={emblem} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <span className={cn(titleVariants({ size: 'display' }), 'font-normal text-foreground')}>{data.name[0]}</span>}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Title size="h1" as="h1">{data.name}</Title>
        {vision ? <p className="max-w-[36em] text-base leading-snug text-muted-foreground">{vision}</p> : null}
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-2 whitespace-nowrap text-xs text-muted-foreground sm:gap-x-6 sm:text-sm">
          <span className="inline-flex items-center gap-1 sm:gap-2"><MapPinIcon className="size-3.5 sm:size-4" aria-hidden="true" />{data.prefecturePath ? <Button variant="link" size="inline" nativeButton={false} render={<Link href={data.prefecturePath} />}>{data.prefecture}</Button> : data.prefecture}</span>
          {people ? <span className="inline-flex items-center gap-1 sm:gap-2"><UsersIcon className="size-3.5 sm:size-4" aria-hidden="true" /><span className="sr-only">人口 </span>{formatPeople(people)}</span> : null}
          {data.officialUrl ? <span className="inline-flex items-center gap-1 sm:gap-2"><GlobeIcon className="size-3.5 sm:size-4" aria-hidden="true" /><Button variant="link" size="inline" nativeButton={false} render={<a href={data.officialUrl} target="_blank" rel="noopener" />}>公式サイト</Button></span> : null}
        </div>
      </div>
      {lead ? (
        <p className="flex flex-col items-center gap-1">
          <span className="text-sm text-muted-foreground">{reiwa(lead.year)}の{lead.label}</span>
          <Title size="display" as="span" className="text-primary"><Amt yen={lead.yen} /></Title>
          {people ? <span className="text-sm text-muted-foreground">1人あたり <Amt yen={lead.yen / people} plainUnit /></span> : null}
        </p>
      ) : null}
      <nav aria-label="お金の使い道を見る" className="grid w-full max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-4">
        {doors.map(({ key, sub, year: y }) => {
          const t = TABS.find((x) => x.key === key)!
          return (
            <Link key={key} href={pageHref(y, key)} onClick={() => setOpening(key)} aria-busy={opening === key} className={cn('flex flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left no-underline', opening === key && 'border-primary')}>
              {opening === key ? <Spinner className="size-5 text-primary" /> : <t.icon className="size-5 text-muted-foreground" aria-hidden="true" />}
              <span className="text-base font-semibold text-foreground">{t.label}</span>
              <span className="text-xs text-muted-foreground">{sub}</span>
            </Link>
          )
        })}
      </nav>
    </section>
  )

  const panel = (key: TabKey) =>
    !v ? null : key === 'overview' ? <Overview /> : key === 'money' ? <MoneyTab key={v.year} phase="initial" active={tab === key} /> : key === 'settled' ? <MoneyTab key={v.year} phase="settlement" active={tab === key} /> : <ProjectsTab filter={filter} setFilter={setFilter} fields={fields} setFields={setFields} q={query} setQ={setQuery} />

  return (
    <div className="@container">
      <div className="mx-auto max-w-[1120px] px-4 pb-48">
        {hub ? (
          <>
            {/* 狭い画面はサイドバーが無いので、左上に風土記のマークを置いてホームへ戻れるようにする */}
            <Link href="/" aria-label="風土記 ホーム" className="mt-4 inline-flex md:hidden"><BrandMark className="size-8 text-primary" /></Link>
            {hero}
            {/* 問いを作っていないまちは、まちの頭と4つの入口だけ */}
            {hasQuestions(data.code) ? (
              <>
                <Separator />
                <div className="pt-6"><QuestionFeedView feed={questions} onOpen={(q) => ask.current?.openPreset(q.q)} /></div>
              </>
            ) : null}
          </>
        ) : (
        <>
        <div ref={tabsTop} aria-hidden="true" />
        {/* 区切りの線は画面の端から端まで引く（50cqw は外側の幅の半分、50% は中身の幅の半分。px で文字の位置は中身に揃える） */}
        <div className="sticky top-0 z-20 mx-[calc(50%-50cqw)] px-[calc(50cqw-50%)] bg-background">
          <Separator className="absolute inset-x-0 bottom-0 data-horizontal:w-auto" />
          <div className="relative z-10 flex h-14 min-w-0 items-center gap-2">
            {projectPage ? (
              // 入れ子の事業は上の事業をパンくずに並べる。分かるまでは事業の頁へ戻るボタンを出しておく
              <ClientSuspense fallback={<ProjectCrumbs base={data.path} label="事業" close={closeProject} open={openProject} ancestors={[]} />} ready={!!res.peek(projectLatestKey(projectPage))}>
                <ProjectBack res={res} id={projectPage} base={data.path} label="事業" close={closeProject} open={openProject} />
              </ClientSuspense>
            ) : (
              // 戻る・頁の名前・年度の切り替えを1行に置き、スクロールしても帯ごと残す（財政は年度を持たない）
              <>
                <Link href={data.path} aria-label={`${data.name}へ戻る`} className="-ml-2 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground"><ArrowLeftIcon className="size-5" aria-hidden="true" /></Link>
                <Title size="h3" as="h1" className="min-w-0 flex-1 truncate">{TABS.find((t) => t.key === tab)?.label}</Title>
                {v && tab !== 'overview' ? (
                  <div className="shrink-0">
                    <div className="md:hidden"><YearMenu years={years} current={v.year} onChange={setYear} /></div>
                    <div className="max-md:hidden"><YearPicker years={years} current={v.year} onChange={setYear} hrefOf={yearHref} /></div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
          {v ? (
            <AppContext.Provider value={{ d, page: data, years, v, res, openProject, go, openField, flow, flowFailed, pickAccount, setsu, extras: extrasProp, prevFieldSubjects, setYear, yearHref }}>
              {projectPage ? (
                <div key={projectPage} className="pt-6"><ProjectPage id={projectPage} /></div>
              ) : (
                <div className="pt-6">
                  {panel(tab)}
                  {/* 予算と決算は見比べたくなるので、頁の終わりにもう一方への入口を置く */}
                  {tab === 'money' || tab === 'settled' ? (
                    <p className="pt-10">
                      <Button variant="link" size="inline" nativeButton={false} render={<Link href={tab === 'money' ? pageHref(latestOf('settlement'), 'settled') : pageHref(latestOf('initial'), 'money')} />} className="inline-flex items-center gap-1 text-base">
                        {tab === 'money' ? '決算を見る' : '予算を見る'}<ArrowRightIcon className="size-4" aria-hidden="true" />
                      </Button>
                    </p>
                  ) : null}
                </div>
              )}

            </AppContext.Provider>
          ) : (
            <p className="pt-6 text-sm text-muted-foreground">データを読み込めませんでした。頁を読み込み直してください。</p>
          )}
        </>
        )}
      </div>
      <AskDock name={data.name} code={data.code} sitekey={sitekey} year={year} detail={() => (v ? (projectPage ? describeProject(res.peek<Loaded<ProjectFull>>(projectLatestKey(projectPage))) : '') : '')} section={TABS.find((t) => t.key === tab)?.label} ask={askLabel(tab)} preset={preset} handle={ask} />
    </div>
  )
}
