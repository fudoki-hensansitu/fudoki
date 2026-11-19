// ホーム（/）。住んでいるまちを選ぶ欄（onboarding.tsx）と、ほかのまちを見る検索。
// 選んだ時点でそのまちに決め、オンボーディングとして札（予算と1人あたりを数え上げ、分野ごとの1人あたりのレシートを出す。receipt.tsx）を出す。
// レシートの分野から興味のある分野を選ばせ、レシートの末端からそのまちの頁へ進む。住んでいるまちを選んだ人がまたホームへ来たら、そのまちの頁へ移す（home/redirect.ts、2026-11-19 yuito）。
// うちのまちは1つで、ブラウザ（localStorage）にだけ置く
// データは自治体の頁と同じ1年度の分（server/app-data.ts）を /api/jurisdictions/:code で読み、yearView で年度ごとに見る
import * as React from 'react'
import { ArrowRightIcon, CaretDownIcon } from '@phosphor-icons/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Footer } from '../nav/footer'
import { Emblem } from './town-picker'
import type { MapEntry } from '../jurisdiction/index-table'
import { yearView, type Snapshot, type YearView } from '../jurisdiction/app/data'
import { reiwa, yearName } from '../jurisdiction/types'
import { ReceiptMachine } from './receipt'
import { loadInterests, MAX_INTERESTS, saveInterests, useMyTown, type Town } from './towns'
import { useRouter } from '@void/react'
import { OtherTowns, AskTown, Intro } from './onboarding'
import { Title } from '@/components/ui/title'

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
  return { d: picked, failed, year: picked ? picked.year : null, setYear }
}

type Ctx = { town: Town; d: Snapshot; v: YearView; year: number; years: number[]; setYear: (y: number) => void; base: string; vision?: string }

function buildCtx(town: Town, d: Snapshot, year: number, setYear: (y: number) => void, vision?: string): Ctx {
  return { town, d, v: yearView(d), year, years: Object.keys(d.kinds).map(Number).sort((a, b) => a - b), setYear, base: `${town.path}/${year}`, vision }
}

const flowHref = (c: Ctx) => `${c.base}/${c.v.word === '決算' ? 'settlement' : 'budget'}`

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
            className={cn('rounded-full px-3 py-1 text-sm transition-colors duration-150 ease-out', y === c.year ? (onBrand ? 'bg-brand-fill text-brand-fill-foreground' : 'bg-primary text-primary-foreground') : onBrand ? 'hover:bg-brand-fill-hover hover:text-brand-fill-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {yearName(y)}
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn('inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm sm:hidden', onBrand ? 'bg-brand-fill text-brand-fill-foreground' : 'bg-secondary text-foreground')}>
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

/** 住んでいるまちを外して選び直す。緑の札の上に置くので、地の文字色を薄めて控えめにする（ダークでも AA の 4.5:1 を保つ 80%） */
function ResetButton({ onReset, className }: { onReset: () => void; className?: string }) {
  return (
    <button type="button" onClick={onReset} className={cn('text-sm opacity-80 transition-opacity hover:opacity-100', className)}>
      リセット
    </button>
  )
}

/** うちのまちの札（レシートの機械）。予算と1人あたりを数え上げ、分野ごとの1人あたりのレシートを出す */
function Dashboard({ c, onReset, interests, onToggle }: { c: Ctx; onReset: () => void; interests: string[]; onToggle: (id: string) => void }) {
  const { v, d, year, town } = c
  const detailHref = c.year === c.years.at(-1) ? c.town.path : flowHref(c)
  return (
    <ReceiptMachine
      interests={interests}
      onToggle={onToggle}
      code={town.code}
      name={town.name}
      v={v}
      year={year}
      pop={d.pop ?? null}
      detailHref={detailHref}
      head={
        <div className="flex flex-wrap items-center gap-4 lg:items-start">
          <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl border-0 p-2" />
          <div className="min-w-0 flex-1">
            <Title size="h1" as="h2">{town.name}</Title>
            <p className="mt-1 truncate text-sm opacity-80">{c.vision}</p>
          </div>
          {/* 住んでいるまちを選び直すリセットは札の中に置く。広くない画面では見出しの行の右上、広い画面では「詳細」の下（2026-11-18 yuito） */}
          <ResetButton onReset={onReset} className="self-start lg:hidden" />
          {/* 年度と、そのまちの頁へ進む導線は、紋章・まちの名前と同じ1行に中心を揃えて右に並べる。広くない画面ではまちの名前を詰めないよう、名前の下の1行に並べる */}
          <div className="flex w-full items-center justify-between gap-2 lg:w-auto lg:shrink-0 lg:items-start">
            <YearSwitch c={c} onBrand />
            <div className="flex flex-col items-end gap-2">
              <Link href={detailHref} className="inline-flex items-center gap-2 rounded-full border border-brand-fill bg-brand-fill px-4 py-2 text-sm font-medium text-brand-fill-foreground transition-colors hover:border-brand-fill-hover hover:bg-brand-fill-hover">
                詳細
                <ArrowRightIcon className="size-4" />
              </Link>
              <ResetButton onReset={onReset} className="max-lg:hidden" />
            </div>
          </div>
        </div>
      }
    />
  )
}

// ---------- 頁 ----------

function Loading() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
      <Skeleton className="h-52 rounded-[24px] md:col-span-2" />
      <Skeleton className="mx-auto h-96 w-[min(440px,calc(100%-40px))] rounded-none md:col-span-2" />
      <p className="text-sm text-muted-foreground md:col-span-2">はじめて開くまちは、集めるのに少し時間がかかります。</p>
    </div>
  )
}

/** うちのまちのデータが揃うまでの出し分け。揃ったら children に渡す */
function WithCtx({ town, vision, snap, onReset, children }: { town: Town; vision?: string; snap: ReturnType<typeof useSnapshot>; onReset: () => void; children: (c: Ctx) => React.ReactNode }) {
  const { d, failed, year, setYear } = snap
  // 札を出せないとき（読めない・読み込み中・未収録）も住んでいるまちを選び直せるよう、札の外の右上にリセットを残す
  const withReset = (node: React.ReactNode) => (
    <>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={onReset} className="text-sm text-muted-foreground hover:text-foreground">
          リセット
        </button>
      </div>
      {node}
    </>
  )
  if (failed) return withReset(<p className="text-sm text-muted-foreground">今はこのまちのデータを読み込めません。少し時間をおいて開き直してください。</p>)
  if (!d || year == null) return withReset(<Loading />)
  if (!d.years[String(year)]) return withReset(<p className="text-sm text-muted-foreground">このまちの予算・決算は、まだ収録していません。</p>)
  return <>{children(buildCtx(town, d, year, setYear, vision))}</>
}

/** まちを選ぶ前のホームで、緑の札の下に置く。他のまちを名前で探す欄と、見本のまち（事業評価か都市像のあるまち）を都市像と並べて開けるようにする。住んでいるまちは変えない */
function FeaturedTowns({ featured, listed }: { featured: Featured[]; listed: boolean }) {
  if (!featured.length && !listed) return null
  return (
    <section className="mt-10" aria-labelledby="featured-towns">
      <Title size="h3" as="h2" id="featured-towns" className="mb-3">他のまちを見る</Title>
      {/* 住んでいるまちは変えずに、そのまちの頁を開く（緑の札の「住んでいるまちを選ぶ」とは別の、地のままの検索欄） */}
      <OtherTowns className="mb-3" />
      <TownList featured={featured} />
    </section>
  )
}

/** 見本のまち（事業評価か都市像のあるまち）を6つまで、紋章・都市像と並べて開けるようにする */
function TownList({ featured }: { featured: Featured[] }) {
  const items = featured.slice(0, 6)
  if (!items.length) return null
  return (
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {items.map((t) => (
        <li key={t.code}>
          <Link href={t.path} className="flex items-center gap-3 rounded-lg px-3 py-3 text-foreground no-underline transition-colors hover:bg-card">
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
  )
}

export function Home({ listed, featured }: HomeProps) {
  const { ready, town, set } = useMyTown()
  const router = useRouter()
  /** この頁を開いてから住んでいるまちを選んだか。選んだ直後はオンボーディング（札とレシート）を出し、前から選んでいた人はそのまちの頁へ移す */
  const fresh = React.useRef(false)
  const leaving = ready && !!town && !fresh.current
  React.useEffect(() => {
    // 頁を読み直して来たときは <head> の script（home/redirect.ts）が先に移すので、ここに来るのは頁を読み直さずにホームへ来たとき
    if (leaving) void router.visit(town!.path, { replace: true })
  }, [leaving])
  const snap = useSnapshot(ready && town && !leaving ? town.code : null)
  const vision = town ? featured.find((f) => f.code === town.code)?.vision : undefined
  /** 興味のある分野（選んだ順）。レシートの分野の行を押して選び、3つまで */
  const [interests, setInterests] = React.useState<string[]>([])
  React.useEffect(() => setInterests(loadInterests()), [])
  const toggle = (id: string) =>
    setInterests((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_INTERESTS ? cur : [...cur, id]
      saveInterests(next)
      return next
    })
  // 住んでいるまちを外す（選び直す）。興味のある分野も選び直す
  const reset = () => {
    setInterests([])
    set(null)
  }
  let body: React.ReactNode
  if (!ready || leaving) body = <Loading />
  // 選んだ時点でそのまちに決める（要点を見せてから決めさせない、2026-11-17 yuito）
  else if (!town)
    body = (
      <AskTown
        listed={listed}
        onPick={(e) => {
          fresh.current = true
          set(toTown(e))
        }}
      />
    )
  else {
    body = (
      // 刷り出すレシートの場所を、はじめから画面1.5枚ぶん取っておき、札へ頁を送っても刷り終える前に頁の末尾（footer）が見えないようにする（2026-11-18 yuito）。
      // レシートの下に他のまちへの導線は置かず、終わりはレシートの末端の「<まち>を開く」だけにする（2026-11-19 yuito）
      <div className="min-h-[150svh]">
        <WithCtx key={town!.code} town={town!} vision={vision} snap={snap} onReset={reset}>
          {(c) => <Dashboard c={c} onReset={reset} interests={interests} onToggle={toggle} />}
        </WithCtx>
      </div>
    )
  }
  const featuredTowns = ready && !town && !leaving ? <FeaturedTowns featured={featured} listed={listed} /> : null
  return (
    <main className={`mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-4xl flex-col px-4 pt-10 pb-28 sm:px-8 sm:pt-14 md:min-h-svh md:pb-10`}>
      <Intro mode={!ready ? 'hidden' : town ? 'compact' : 'full'} />
      {body}
      {featuredTowns}
      <Footer />
    </main>
  )
}
