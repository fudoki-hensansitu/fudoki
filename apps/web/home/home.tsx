// ホーム（/）。住んでいるまちのダッシュボード（総額・何に使っている・始めた事業・やめた事業・事業評価）と、ほかのまちを見る検索。
// 住んでいるまちを決めていないときは、はじめての流れ（onboarding.tsx: まちを選ぶ → 要点 → ツアー → チェックリスト）を出す。うちのまちは1つで、ブラウザ（localStorage）にだけ置く
// データは自治体の頁と同じ /api/jurisdictions/app/:code を読み、yearView で年度ごとに見る
import * as React from 'react'
import { useRouter } from '@void/react'
import { ArrowRightIcon, ArrowSquareOutIcon, CaretDownIcon, ClipboardTextIcon, CoinsIcon } from '@phosphor-icons/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FEEDBACK } from '../nav/feedback'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem } from './town-picker'
import type { MapEntry } from '../jurisdiction/index-table'
import { GRADES, yearView, type Snapshot, type YearView } from '../jurisdiction/app/data'
import { NewIcon, StopIcon } from '../jurisdiction/fresh-icons'
import { reiwa, yearName } from '../jurisdiction/types'
import { Amt, FieldIcon, perHeadText } from './parts'
import { searchHref } from '../search/search'
import { useMyTown, type Town } from './towns'
import { onboarded, Tour, useTour, type TourStep } from './tour'
import { OtherTowns, Checklist, Empty, Intro, Steps, startChecklist, type CheckItem } from './onboarding'

export interface Featured {
  code: string
  name: string
  path: string
  vision?: string
  /** 自治体の頁で選べる年度のうち、事業評価を収録した最新の年度。札はその年度の事業のタブへ繋ぐ */
  evalYear?: number
}

export interface HomeProps {
  entries: MapEntry[]
  /** くわしい頁（事業評価・新しく始めること）のある自治体 */
  featured: Featured[]
}


const toTown = (e: MapEntry): Town => ({ code: e.code, name: e.name, path: e.path })

/** うちのまちのデータ。年度は収録の最新から始める */
function useSnapshot(code: string | null) {
  const [d, setD] = React.useState<Snapshot | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [year, setYear] = React.useState<number | null>(null)
  React.useEffect(() => {
    let alive = true
    setD(null)
    setFailed(false)
    if (!code) return
    fetch(`/api/jurisdictions/app/${code}`)
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(r)))
      .then((x) => {
        if (!alive) return
        setD(x)
        setYear(Math.max(...Object.keys(x.years).map(Number)))
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [code])
  return { d, failed, year, setYear }
}

type Ctx = { town: Town; d: Snapshot; v: YearView; year: number; years: number[]; setYear: (y: number) => void; base: string; vision?: string }

function buildCtx(town: Town, d: Snapshot, year: number, setYear: (y: number) => void, vision?: string): Ctx {
  return { town, d, v: yearView(d, year), year, years: Object.keys(d.years).map(Number).sort((a, b) => a - b), setYear, base: `${town.path}/${year}`, vision }
}

const flowHref = (c: Ctx) => `${c.base}/${c.v.word === '決算' ? 'settlement' : 'budget'}`
const sheetsOf = (d: Snapshot) => {
  const fy = Math.max(0, ...d.sheets.map((s) => s.fy))
  return { fy, sheets: d.sheets.filter((s) => s.fy === fy) }
}
const pct = (yen: number, total: number) => `${((yen / total) * 100).toFixed(1)}%`

const More = ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
  <Link href={href} className={cn('inline-flex items-center gap-1 text-[13px] text-primary hover:underline', className)}>
    {children}
    <ArrowRightIcon className="size-3.5" />
  </Link>
)

/**
 * 年度の切り替え。名前は自治体の頁と同じく今年度・昨年度…で呼び、新しい年度から並べる。
 * スマホは自治体の頁と同じく選んでいる年度だけを出し、押すとメニューで切り替える
 */
function YearSwitch({ c, onBrand }: { c: Ctx; onBrand?: boolean }) {
  if (c.years.length < 2) return null
  const years = [...c.years].sort((a, b) => b - a)
  return (
    <>
      <div className={cn('hidden gap-1 rounded-full p-1 sm:flex', onBrand ? 'bg-brand-fill/20' : 'bg-secondary')} role="group" aria-label="年度">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => c.setYear(y)}
            aria-pressed={y === c.year}
            title={reiwa(y)}
            className={cn('rounded-full px-3 py-1 text-[13px] transition-colors duration-150 ease-out', y === c.year ? (onBrand ? 'bg-brand-fill text-brand-fill-foreground' : 'bg-background text-foreground shadow-sm') : onBrand ? 'hover:bg-white/10' : 'text-muted-foreground hover:text-foreground')}
          >
            {yearName(y)}
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[15px] sm:hidden', onBrand ? 'bg-brand-fill text-brand-fill-foreground' : 'bg-secondary text-foreground')}>
          {yearName(c.year)}
          <CaretDownIcon className="size-3.5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuRadioGroup value={String(c.year)} onValueChange={(v) => c.setYear(Number(v))}>
            {years.map((y) => (
              <DropdownMenuRadioItem key={y} value={String(y)}>
                {yearName(y)}
                {yearName(y) !== reiwa(y) ? `（${reiwa(y).replace(/年度$/, '')}）` : ''}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function ProjectList({ items, rest }: { items: { id: string; name: string; yen: number | null }[]; rest: number }) {
  return (
    <ul className="divide-y">
      {items.map((p) => (
        <li key={p.id} className="flex items-baseline gap-3 py-2 text-sm first:pt-0">
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <Amt yen={p.yen} className="font-medium" />
        </li>
      ))}
      {rest > 0 ? <li className="pt-2 text-xs text-muted-foreground">ほか {rest} 件</li> : null}
    </ul>
  )
}

function FieldBars({ c, limit }: { c: Ctx; limit: number }) {
  return (
    <ul className="space-y-2.5">
      {c.v.fields.slice(0, limit).map((f) => (
        <li key={f.id}>
          <Link href={`${c.base}/fields/${f.id}`} className="group block">
            <span className="flex items-center gap-2 text-sm">
              <FieldIcon id={f.id} className="size-[18px] text-muted-foreground" />
              <span className="flex-1 group-hover:text-primary">{f.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{pct(f.yen, c.v.total)}</span>
              <Amt yen={f.yen} className="w-20 text-right text-sm font-medium" />
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-primary/70" style={{ width: pct(f.yen, c.v.total) }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Card({ title, icon, children, footer, className, tour }: { title: string; icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string; tour?: string }) {
  return (
    <section data-tour={tour} className={cn('flex flex-col rounded-2xl border bg-background p-5 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold [&_svg]:size-5 [&>svg]:text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="flex-1">{children}</div>
      {footer ? <div className="mt-3 border-t pt-3">{footer}</div> : null}
    </section>
  )
}

function Dashboard({ c }: { c: Ctx }) {
  const { v, d, year, town } = c
  const { fy, sheets } = sheetsOf(d)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section data-tour="total" className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7 md:col-span-2">
        <div className="flex items-start gap-4">
          <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl border-0 p-2" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold sm:text-[28px]">{town.name}</h2>
            <p className="mt-0.5 truncate text-sm opacity-80">{c.vision}</p>
          </div>
          {/* 年度は数字の頭に効くので上に、頁へ進む導線は数字を読んだあとの下に置く */}
          <YearSwitch c={c} onBrand />
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm opacity-80">
              {yearName(year)}の{v.word === '決算' ? '決算' : '当初予算'}
            </p>
            <p className="mt-1 text-[40px] leading-none font-bold sm:text-[48px]">
              <Amt yen={v.total} />
            </p>
            {d.pop ? <p className="mt-2 text-sm opacity-80">1人あたり {perHeadText(v.total, d.pop)}</p> : null}
          </div>
          <Link data-tour="open" href={c.base} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover">
            詳細を見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>
      {v.fields.length ? (
        <Card tour="fields" title="何に使っている？" icon={<CoinsIcon />} footer={<More href={flowHref(c)}>お金の流れを見る</More>}>
          <FieldBars c={c} limit={6} />
        </Card>
      ) : null}
      {v.comparable && v.newProjects.length ? (
        <Card tour="projects" title={`${yearName(year)}に始めた事業`} icon={<span className="flex text-primary"><NewIcon /></span>} footer={<More href={`${c.base}/projects?filter=new`}>事業をすべて見る</More>}>
          <ProjectList items={v.newProjects.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={v.newProjects.length - 5} />
        </Card>
      ) : v.current.length ? (
        <Card tour="projects" title="お金のかかる事業" icon={<CoinsIcon />} footer={<More href={`${c.base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.current.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={0} />
        </Card>
      ) : null}
      {v.comparable && v.ended.length ? (
        <Card title={`${yearName(year - 1)}でやめた事業`} icon={<span className="flex text-primary"><StopIcon /></span>} footer={<More href={`${c.base}/projects?filter=ended`}>事業をすべて見る</More>}>
          <ProjectList items={v.ended.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p, String(year - 1)) ?? null }))} rest={v.ended.length - 5} />
        </Card>
      ) : null}
      {sheets.length ? (
        <Card title={`${yearName(fy)}の事業評価`} icon={<ClipboardTextIcon />} footer={<More href={`${town.path}/${fy}/projects`}>事業を見る</More>}>
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-bold text-foreground tabular-nums">{sheets.length}</span> 件の事業を振り返りました
          </p>
          <ul className="mt-4 grid grid-cols-4 gap-2">
            {GRADES.map(([g, label]) => (
              <li key={g} className="rounded-xl bg-card px-2 py-2.5 text-center">
                <span className="block text-lg font-bold tabular-nums">{sheets.filter((s) => s.grade === g).length}</span>
                <span className="block text-[11px] text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

// ---------- 頁 ----------

function Loading() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
      <Skeleton className="h-44 rounded-[24px] md:col-span-2" />
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
      <p className="text-[13px] text-muted-foreground md:col-span-2">はじめて開くまちは、集めるのに少し時間がかかります。</p>
    </div>
  )
}

/** うちのまちのデータが揃うまでの出し分け。揃ったら children に渡す */
function WithCtx({ town, vision, snap, children }: { town: Town; vision?: string; snap: ReturnType<typeof useSnapshot>; children: (c: Ctx) => React.ReactNode }) {
  const { d, failed, year, setYear } = snap
  if (failed) return <p className="text-sm text-muted-foreground">今はこのまちのデータを読み込めません。少し時間をおいて開き直してください。</p>
  if (!d || year == null) return <Loading />
  if (!d.years[String(year)]) return <p className="text-sm text-muted-foreground">このまちの予算・決算は、まだ収録していません。</p>
  return <>{children(buildCtx(town, d, year, setYear, vision))}</>
}

/** はじめての流れの2歩目: 選んだまちの要点を一枚で見せる。「このまちにする」で決める */
function Reveal({ c, onOpen, onBack }: { c: Ctx; onOpen: () => void; onBack: () => void }) {
  const { town, d, v, year } = c
  const top = v.fields[0]
  const rows: [string, React.ReactNode][] = [
    [`${yearName(year)}の${v.word === '決算' ? '決算' : '当初予算'}`, <Amt key="t" yen={v.total} className="text-[28px] font-bold sm:text-[32px]" />],
    ...(d.pop ? ([['1人あたり', <span key="p" className="text-[20px] font-bold">{perHeadText(v.total, d.pop)}</span>]] as [string, React.ReactNode][]) : []),
    ...(top
      ? ([
          [
            'いちばん多い分野',
            <span key="f" className="flex items-center gap-1.5 text-[18px] font-bold">
              <FieldIcon id={top.id} className="size-5 text-muted-foreground" />
              {top.name}
              <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{pct(top.yen, v.total)}</span>
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
  ]
  return (
    <section className="ob-swap rounded-[24px] border bg-background p-5 sm:p-7">
      <Steps at={2} of={2} />
      <div className="flex items-center gap-3">
        <Emblem code={town.code} name={town.name} className="size-11 rounded-xl p-1.5" />
        <h2 className="text-[22px] font-bold">{town.name}</h2>
      </div>
      <dl className="mt-5 divide-y">
        {rows.map(([k, val], i) => (
          <div key={k} className="ob-fade flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3" style={{ '--d': `${0.12 + i * 0.12}s` } as React.CSSProperties}>
            <dt className="text-[14px] text-muted-foreground">{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
      {/* 1歩目の「現在地から選ぶ」と同じく、決めるボタンは右に置く（PC で左右に跳ばない）。スマホは幅いっぱいにして、選び直すは下 */}
      <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button type="button" onClick={onBack} className="py-1 text-[13px] text-muted-foreground hover:text-foreground">
          ちがうまちを選ぶ
        </button>
        <button type="button" onClick={onOpen} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none">
          このまちにする
          <ArrowRightIcon className="size-4" />
        </button>
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground sm:text-right">次に開いたときも、このまちから始まります。あとから変えられます。</p>
    </section>
  )
}

/** チェックリストの残りの項目。まちの頁・検索・アシスタントへ */
const checkItems = (c: Ctx): CheckItem[] => [
  { key: 'flow', label: 'お金の使い道を見る', href: flowHref(c) },
  { key: 'projects', label: '新しく始めた事業を見る', href: `${c.base}/projects?filter=new` },
  { key: 'search', label: '事業を検索する', href: searchHref('', c.town.code) },
  { key: 'assistant', label: 'アシスタントに聞く', href: '/assistant' },
]

/** 住んでいるまちを選んだ直後のツアーの1歩目。まちの頁を開かせ、続き（年度・予算・事業・文字を選んで聞く）はまちの頁の PageTour が出す */
const tourSteps = (c: Ctx, go: () => void): TourStep[] => [
  { target: 'open', title: 'まちの頁を開く', body: `${c.town.name}の予算・決算・事業を、まとめて見られる頁です。押して開いてみてください。`, mode: 'click', action: { label: '開く', run: go } },
]

const DOCS = 'https://docs.fudoki.dev'

/** 頁の末尾。風土記について・利用規約・プライバシーポリシーへはここから辿る（前のホームと同じ並び） */
function Footer() {
  const ext = 'inline-flex items-center gap-1 hover:text-foreground'
  return (
    <footer className="mt-auto flex pt-12 flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
      <span>© 2026 風土記</span>
      <span className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/about" className="hover:text-foreground">
          風土記について
        </Link>
        <a href={`${DOCS}/terms`} target="_blank" rel="noopener" className={ext}>
          利用規約
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
        <a href={`${DOCS}/privacy`} target="_blank" rel="noopener" className={ext}>
          プライバシーポリシー
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
        <a href={FEEDBACK} target="_blank" rel="noopener" className={ext}>
          フィードバック
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
        <a href="mailto:support@fudoki.dev" className="hover:text-foreground">
          お問い合わせ
        </a>
      </span>
    </footer>
  )
}

export function Home({ entries, featured }: HomeProps) {
  const { ready, town, set } = useMyTown()
  const tour = useTour('home')
  const { visit } = useRouter()
  // はじめての流れで選んだまち。要点を見せてから「このまちにする」で決める
  const [pending, setPending] = React.useState<Town | null>(null)
  const shown = town ?? pending
  const snap = useSnapshot(ready && shown ? shown.code : null)
  const vision = shown ? featured.find((f) => f.code === shown.code)?.vision : undefined
  const open = () => {
    if (!pending) return
    startChecklist()
    tour.start()
    set(pending)
    setPending(null)
  }
  // 住んでいるまちを外す（選び直す）。前にはじめての流れを通った人は、選んだらそのままダッシュボードに戻す
  const reset = () => set(null)
  const again = ready && !town && onboarded()
  let body: React.ReactNode
  if (!ready) body = <Loading />
  else if (!town)
    body = (
      <Empty
        entries={entries}
        again={again}
        onPick={(e) => (again ? set(toTown(e)) : setPending(toTown(e)))}
        reveal={
          pending ? (
            <>
              <WithCtx town={pending} vision={vision} snap={snap}>
                {(c) => <Reveal c={c} onOpen={open} onBack={() => setPending(null)} />}
              </WithCtx>
              {/* 読み込み中・失敗・年度なしでは Reveal が出ないので、選び直す導線をここに残す */}
              {snap.d && snap.year != null && snap.d.years[String(snap.year)] ? null : (
                <button type="button" onClick={() => setPending(null)} className="mt-3 text-[13px] text-muted-foreground hover:text-foreground">
                  ちがうまちを選ぶ
                </button>
              )}
            </>
          ) : null
        }
      />
    )
  else {
    // はじめにやること（ツアー中はツアー）を頭に出すため、まちのデータが読めたら先に組む
    const ctx = snap.d && snap.year != null && snap.d.years[String(snap.year)] ? buildCtx(town!, snap.d, snap.year, snap.setYear, vision) : null
    body = (
      <>
        {ctx ? tour.on ? <Tour steps={tourSteps(ctx, () => (tour.to('page'), visit(ctx.base)))} onDone={tour.done} total={5} /> : <Checklist items={checkItems(ctx)} /> : null}
        {/* ほかのまちを見る導線。選ぶ前は AskTown の欄だけなので、ここは選んだあとだけ */}
        <OtherTowns entries={entries} className="mb-3" />
        {/* リセットはまちの札の右上に添える（住んでいるまちを選び直す） */}
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={reset} className="text-[13px] text-muted-foreground hover:text-foreground">
            リセット
          </button>
        </div>
        <WithCtx town={town!} vision={vision} snap={snap}>
          {(c) => <Dashboard c={c} />}
        </WithCtx>
      </>
    )
  }
  return (
    <main className="mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-4xl flex-col px-4 pt-10 pb-28 sm:px-8 sm:pt-14 md:min-h-svh md:pb-10">
      <Intro mode={!ready ? 'hidden' : town ? 'compact' : 'full'} />
      {body}
      <Footer />
    </main>
  )
}
