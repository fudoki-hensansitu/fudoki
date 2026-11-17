// ホーム（/）。住んでいるまちのダッシュボード（総額・何に使っている・始めた事業・やめた事業・事業評価）と、ほかのまちを見る検索。
// 住んでいるまちを決めていないときは、住んでいるまちを選ぶ欄（onboarding.tsx）を出し、選んだ時点でそのまちに決めてダッシュボードを出す。うちのまちは1つで、ブラウザ（localStorage）にだけ置く
// データは自治体の頁と同じ1年度の分（server/app-data.ts）を /api/jurisdictions/:code で読み、yearView で年度ごとに見る
import * as React from 'react'
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
import { useMyTown, type Town } from './towns'
import { OtherTowns, AskTown, Intro } from './onboarding'

export interface Featured {
  code: string
  name: string
  path: string
  prefecture: string
  vision?: string
  /** 自治体の頁で選べる年度のうち、事業評価を収録した最新の年度。札はその年度の事業のタブへ繋ぐ */
  evalYear?: number
}

export interface HomeProps {
  /** 自治体の一覧を読めたか。読めなければ、名前で探す欄の代わりに読み込めないと出す */
  listed: boolean
  /** くわしい頁（事業評価・新しく始めること）のある自治体 */
  featured: Featured[]
}


const toTown = (e: MapEntry): Town => ({ code: e.code, name: e.name, path: e.path })

/** うちのまちのデータ。年度は収録の最新から始め、年度を切り替えたらその年度の分を読む（読んだ年度は持っておく） */
function useSnapshot(code: string | null) {
  const [byYear, setByYear] = React.useState<Record<string, Snapshot>>({})
  const [failed, setFailed] = React.useState(false)
  const [year, setYear] = React.useState<number | null>(null)
  React.useEffect(() => {
    setByYear({})
    setFailed(false)
    setYear(null)
  }, [code])
  React.useEffect(() => {
    if (!code || (year != null && byYear[String(year)])) return
    let alive = true
    fetch(`/api/jurisdictions/${code}${year == null ? '' : `?year=${year}`}`)
      .then((r) => (r.ok ? (r.json() as Promise<Snapshot>) : Promise.reject(r)))
      .then((x) => {
        if (!alive) return
        setByYear((m) => ({ ...m, [String(x.year)]: x }))
        setYear(x.year)
        setFailed(false)
      })
      .catch(() => {
        if (!alive) return
        // 読めている年度があればそこへ戻し、同じ年度をもう一度押せば読み直す
        const back = Object.values(byYear)[0]
        if (back) setYear(back.year)
        else setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [code, year, byYear])
  const picked = year == null ? null : (byYear[String(year)] ?? Object.values(byYear)[0] ?? null)
  // 評価のカードは最初に読んだ（年度なしの）応答の最新の評価を使い、年度を切り替えても残す
  const evaluated = Object.values(byYear).find((s) => s.evaluated)?.evaluated
  const d = picked && !picked.evaluated && evaluated ? { ...picked, evaluated } : picked
  return { d, failed, year: d ? d.year : null, setYear }
}

type Ctx = { town: Town; d: Snapshot; v: YearView; year: number; years: number[]; setYear: (y: number) => void; base: string; vision?: string }

function buildCtx(town: Town, d: Snapshot, year: number, setYear: (y: number) => void, vision?: string): Ctx {
  return { town, d, v: yearView(d), year, years: Object.keys(d.kinds).map(Number).sort((a, b) => a - b), setYear, base: `${town.path}/${year}`, vision }
}

const flowHref = (c: Ctx) => `${c.base}/${c.v.word === '決算' ? 'settlement' : 'budget'}`
const sheetsOf = (d: Snapshot) => d.evaluated ?? { fy: 0, sheets: [] }
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
      <div className={cn('hidden gap-1 rounded-full p-1 sm:flex', onBrand ? 'border border-brand-foreground' : 'bg-secondary')} role="group" aria-label="年度">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => c.setYear(y)}
            aria-pressed={y === c.year}
            title={reiwa(y)}
            className={cn('rounded-full px-3 py-1 text-[13px] transition-colors duration-150 ease-out', y === c.year ? (onBrand ? 'bg-brand-fill text-brand-fill-foreground' : 'bg-primary text-primary-foreground') : onBrand ? 'hover:bg-brand-fill-hover hover:text-brand-fill-foreground' : 'text-muted-foreground hover:text-foreground')}
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
          <Link href={`${c.base}/projects?field=${f.id}`} className="group block">
            <span className="flex items-center gap-2 text-sm">
              <FieldIcon id={f.id} className="size-[18px] text-muted-foreground" />
              <span className="flex-1 group-hover:text-primary">{f.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{pct(f.yen, c.v.total)}</span>
              <Amt yen={f.yen} className="w-20 text-right text-sm font-medium" />
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-primary" style={{ width: pct(f.yen, c.v.total) }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Card({ title, icon, children, footer, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col rounded-2xl border bg-background p-5', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-medium [&_svg]:size-5 [&>svg]:text-muted-foreground">
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
      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7 md:col-span-2">
        <div className="flex items-start gap-4">
          <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl border-0 p-2" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold sm:text-[28px]">{town.name}</h2>
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
            <p className="mt-1 text-[40px] leading-none font-semibold sm:text-[48px]">
              <Amt yen={v.total} />
            </p>
            {d.pop ? <p className="mt-2 text-sm opacity-80">1人あたり {perHeadText(v.total, d.pop)}</p> : null}
          </div>
          <Link href={c.year === c.years.at(-1) ? c.town.path : flowHref(c)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover">
            詳細を見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>
      {v.fields.length ? (
        <Card title="何に使っている？" icon={<CoinsIcon />} footer={<More href={flowHref(c)}>お金の流れを見る</More>}>
          <FieldBars c={c} limit={6} />
        </Card>
      ) : null}
      {v.comparable && v.page('new')?.rows.length ? (
        <Card title={`${yearName(year)}に始めた事業`} icon={<span className="flex text-primary"><NewIcon /></span>} footer={<More href={`${c.base}/projects?filter=new`}>事業をすべて見る</More>}>
          <ProjectList items={v.page('new')!.rows.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: p.yen }))} rest={v.page('new')!.total - 5} />
        </Card>
      ) : v.top.length ? (
        <Card title="お金のかかる事業" icon={<CoinsIcon />} footer={<More href={`${c.base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.top.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: p.yen }))} rest={0} />
        </Card>
      ) : null}
      {v.comparable && v.page('ended')?.rows.length ? (
        <Card title={`${yearName(year - 1)}でやめた事業`} icon={<span className="flex text-primary"><StopIcon /></span>} footer={<More href={`${c.base}/projects?filter=ended`}>事業をすべて見る</More>}>
          <ProjectList items={v.page('ended')!.rows.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: p.yen }))} rest={v.page('ended')!.total - 5} />
        </Card>
      ) : null}
      {sheets.length ? (
        <Card title={`${yearName(fy)}の事業評価`} icon={<ClipboardTextIcon />} footer={<More href={`${town.path}/${fy}/projects`}>事業を見る</More>}>
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-semibold text-foreground tabular-nums">{sheets.length}</span> 件の事業を振り返りました
          </p>
          <ul className="mt-4 grid grid-cols-4 gap-2">
            {GRADES.map(([g, label]) => (
              <li key={g} className="rounded-xl bg-card px-2 py-2.5 text-center">
                <span className="block text-lg font-medium tabular-nums">{sheets.filter((s) => s.grade === g).length}</span>
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

/** まちを選ぶ前のホームで、緑の札の下に置く。他のまちを名前で探す欄と、見本のまち（事業評価か都市像のあるまち）を都市像と並べて開けるようにする。住んでいるまちは変えない */
function FeaturedTowns({ featured, listed }: { featured: Featured[]; listed: boolean }) {
  const items = featured.slice(0, 6).map((f) => ({ ...f, href: f.path }))
  if (!items.length && !listed) return null
  return (
    <section className="mt-10" aria-labelledby="featured-towns">
      <h2 id="featured-towns" className="mb-3 text-[17px] font-semibold">他のまちを見る</h2>
      {/* 住んでいるまちは変えずに、そのまちの頁を開く（緑の札の「住んでいるまちを選ぶ」とは別の、地のままの検索欄） */}
      <OtherTowns className="mb-3" />
      <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {items.map((t) => (
          <li key={t.code}>
            <Link href={t.href} className="flex items-center gap-3 rounded-lg px-2.5 py-3 text-foreground no-underline transition-colors hover:bg-card">
              <Emblem code={t.code} name={t.name} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">
                  {t.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{t.prefecture}</span>
                </span>
                {t.vision ? <span className="block truncate text-xs text-muted-foreground">{t.vision}</span> : null}
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

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

export function Home({ listed, featured }: HomeProps) {
  const { ready, town, set } = useMyTown()
  const snap = useSnapshot(ready && town ? town.code : null)
  const vision = town ? featured.find((f) => f.code === town.code)?.vision : undefined
  // 住んでいるまちを外す（選び直す）
  const reset = () => set(null)
  let body: React.ReactNode
  if (!ready) body = <Loading />
  // 選んだ時点でそのまちに決める（要点を見せてから決めさせない、2026-11-17 yuito）
  else if (!town) body = <AskTown listed={listed} onPick={(e) => set(toTown(e))} />
  else {
    body = (
      <>
        {/* ほかのまちを見る導線。選ぶ前は AskTown の欄だけなので、ここは選んだあとだけ */}
        <OtherTowns className="mb-3" />
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
  const featuredTowns = ready && !town ? <FeaturedTowns featured={featured} listed={listed} /> : null
  return (
    <main className="mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-4xl flex-col px-4 pt-10 pb-28 sm:px-8 sm:pt-14 md:min-h-svh md:pb-10">
      <Intro mode={!ready ? 'hidden' : town ? 'compact' : 'full'} />
      {body}
      {featuredTowns}
      <Footer />
    </main>
  )
}
