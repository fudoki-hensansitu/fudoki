// 試作: アプリのホーム。サイドバーの4項目（まちを探す・うちのまち・事業を探す・アシスタント）に合わせ、3つの組み方で見比べる（prototype skill。上のピッカーで切り替え、サイドバーも同じ案に変わる）。
// 1 うちのまち中心: ホーム＝うちのまちのダッシュボード。探すのはサイドバー / 2 さがす中心: ホーム＝まち・事業を探す入口、うちのまちは小さく / 3 まちの中で使う: うちのまちの中で聞く・探す、要点は小さく。
// データは自治体の頁と同じ /api/jurisdictions/app/:code を読み、yearView で年度ごとに見る
import * as React from 'react'
import { ArrowRightIcon, ClipboardTextIcon, CoinsIcon, ListMagnifyingGlassIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { StartForm } from '../chat/start-form'
import { Link } from '../nav/link'
import { Emblem, LocateButton, Picker as TownPicker } from '../home/home'
import type { MapEntry } from '../jurisdiction/index-table'
import { GRADES, yearView, type Snapshot, type YearView } from '../jurisdiction/app/data'
import { NewIcon, StopIcon } from '../jurisdiction/fresh-icons'
import { formatPeople, reiwa } from '../jurisdiction/types'
import type { Props } from '../pages/prototype/index.server'
import { Amt, FieldIcon, perHeadText } from './parts'
import { EXAMPLES, ProjectSearchBox, searchHref } from './search'
import { useMyTown, type Town } from './towns'
import { useVariant } from './variant'

const toTown = (e: MapEntry): Town => ({ code: e.code, name: e.name, path: e.path })

// ---------- 3案で共通のもの ----------

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

function YearSwitch({ c, onBrand }: { c: Ctx; onBrand?: boolean }) {
  if (c.years.length < 2) return null
  return (
    <div className={cn('flex gap-1 rounded-full p-1', onBrand ? 'bg-brand-fill/20' : 'bg-secondary')} role="group" aria-label="年度">
      {c.years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => c.setYear(y)}
          aria-pressed={y === c.year}
          className={cn('rounded-full px-3 py-1 text-[13px] transition-colors duration-150 ease-out', y === c.year ? (onBrand ? 'bg-brand-fill text-brand-fill-foreground' : 'bg-background text-foreground shadow-sm') : onBrand ? 'hover:bg-white/10' : 'text-muted-foreground hover:text-foreground')}
        >
          {reiwa(y).replace('年度', '')}
        </button>
      ))}
    </div>
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

// ---------- 1 うちのまち中心: ホームはうちのまちのダッシュボード ----------

function Card({ title, icon, children, footer, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col rounded-2xl border bg-background p-5 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold [&_svg]:size-5 [&_svg]:text-muted-foreground">
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
            <h2 className="text-2xl font-bold sm:text-[28px]">{town.name}</h2>
            <p className="mt-0.5 truncate text-sm opacity-80">{[c.vision, d.pop ? formatPeople(d.pop) : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <Link href={c.base} className="hidden shrink-0 items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover sm:inline-flex">
            ページを見る
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm opacity-80">
              {reiwa(year)}の{v.word === '決算' ? '決算' : '当初予算'}
            </p>
            <p className="mt-1 text-[40px] leading-none font-bold sm:text-[48px]">
              <Amt yen={v.total} />
            </p>
            {d.pop ? <p className="mt-2 text-sm opacity-80">1人あたり {perHeadText(v.total, d.pop)}</p> : null}
          </div>
          <YearSwitch c={c} onBrand />
        </div>
      </section>
      {v.fields.length ? (
        <Card title="何に使っている？" icon={<CoinsIcon />} footer={<More href={flowHref(c)}>お金の流れを見る</More>}>
          <FieldBars c={c} limit={6} />
        </Card>
      ) : null}
      {v.comparable && v.newProjects.length ? (
        <Card title={`${reiwa(year)}に始めた事業`} icon={<NewIcon />} footer={<More href={`${c.base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.newProjects.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={v.newProjects.length - 5} />
        </Card>
      ) : v.current.length ? (
        <Card title="お金のかかる事業" icon={<CoinsIcon />} footer={<More href={`${c.base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.current.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={0} />
        </Card>
      ) : null}
      {v.comparable && v.ended.length ? (
        <Card title={`${reiwa(year - 1)}でやめた事業`} icon={<StopIcon />} footer={<More href={`${c.base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.ended.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p, String(year - 1)) ?? null }))} rest={v.ended.length - 5} />
        </Card>
      ) : null}
      {sheets.length ? (
        <Card title={`${reiwa(fy)}の事業評価`} icon={<ClipboardTextIcon />} footer={<More href={`${town.path}/${fy}/projects`}>事業を見る</More>}>
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


// ---------- 2 さがす中心: ホームはまち・事業を探す入口。うちのまちは下に小さく ----------

const SEEK = 'fudoki:seek-town'

function Seek({ entries, town, recent, snap, onChoose }: { entries: MapEntry[]; town: Town | null; recent: Town[]; snap: ReturnType<typeof useSnapshot>; onChoose: () => void }) {
  const { visit } = useRouter()
  const [tab, setTab] = React.useState<'town' | 'project'>('town')
  const box = React.useRef<HTMLDivElement>(null)
  // サイドバーの「まちを探す」から来たら、まちの欄に入れる
  React.useEffect(() => {
    const focus = () => {
      setTab('town')
      requestAnimationFrame(() => box.current?.querySelector('input')?.focus())
    }
    if (new URLSearchParams(location.search).get('seek') === 'town') focus()
    window.addEventListener(SEEK, focus)
    return () => window.removeEventListener(SEEK, focus)
  }, [])
  const { d, year } = snap
  const v = d && year != null && d.years[String(year)] ? yearView(d, year) : null
  return (
    <div className="space-y-4">
      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
        <h2 className="text-xl font-bold sm:text-2xl">何を探しますか？</h2>
        <div className="mt-4 mb-4 flex w-fit gap-1 rounded-full bg-brand-fill/20 p-1" role="tablist" aria-label="探すもの">
          {(
            [
              ['town', 'まちを探す', <MagnifyingGlassIcon key="i" />],
              ['project', '事業を探す', <ListMagnifyingGlassIcon key="i" />],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn('flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors duration-150 ease-out [&_svg]:size-4', tab === k ? 'bg-brand-fill text-brand-fill-foreground' : 'hover:bg-white/10')}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <div ref={box} key={tab} className="animate-in fade-in duration-200 ease-out motion-reduce:animate-none">
          {tab === 'town' ? (
            <>
              <TownPicker entries={entries} onPick={(e) => visit(e.path)} placeholder="自治体名で探す（例：品川）" />
              <p className="mt-3 text-[13px] opacity-80">収録しているまちの予算・決算・事業を開きます。</p>
            </>
          ) : (
            <>
              <ProjectSearchBox placeholder="例：給食、プール、保育" />
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((x) => (
                  <Link key={x} href={searchHref(x)} className="rounded-full bg-brand-fill/20 px-3 py-1 text-[13px] transition-colors hover:bg-brand-fill/35">
                    {x}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {town ? (
        <section className="rounded-2xl border bg-background p-5 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none">
          <div className="flex items-center gap-3">
            <Emblem code={town.code} name={town.name} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted-foreground">うちのまち</p>
              <p className="truncate text-lg font-bold">{town.name}</p>
            </div>
            {v && year != null ? (
              <div className="text-right">
                <p className="text-[12px] text-muted-foreground">
                  {reiwa(year)}の{v.word === '決算' ? '決算' : '当初予算'}
                </p>
                <Amt yen={v.total} className="text-2xl font-bold text-primary" />
              </div>
            ) : snap.failed ? null : (
              <Skeleton className="h-10 w-28" />
            )}
          </div>
          {v && year != null ? (
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {v.fields.slice(0, 3).map((f) => (
                <li key={f.id}>
                  <Link href={`${town.path}/${year}/fields/${f.id}`} className="block rounded-xl bg-card px-3 py-2.5 transition-colors hover:bg-accent">
                    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <FieldIcon id={f.id} className="size-4" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <Amt yen={f.yen} className="mt-0.5 block text-base font-bold" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <More href={town.path}>{town.name}のページを見る</More>
            <More href={searchHref('', town.code)}>{town.name}の事業を探す</More>
            <button type="button" onClick={onChoose} className="ms-auto text-[13px] text-muted-foreground hover:text-foreground">
              変える
            </button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={onChoose} className="flex w-full items-center gap-3 rounded-2xl border border-dashed bg-background p-5 text-left transition-colors hover:bg-accent">
          <span className="flex-1">
            <span className="block font-bold">うちのまちを選ぶ</span>
            <span className="block text-[13px] text-muted-foreground">選ぶと、そのまちのお金の要点がここに出ます。</span>
          </span>
          <ArrowRightIcon className="size-5 text-muted-foreground" />
        </button>
      )}

      {recent.length ? (
        <section>
          <h3 className="mb-2 text-[13px] text-muted-foreground">最近見たまち</h3>
          <ul className="flex flex-wrap gap-2">
            {recent.slice(0, 6).map((t) => (
              <li key={t.code}>
                <Link href={t.path} className="flex items-center gap-2 rounded-full border bg-background py-1 ps-1 pe-3 text-sm transition-colors hover:bg-accent">
                  <Emblem code={t.code} name={t.name} className="size-7 rounded-full p-1" />
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

// ---------- 3 まちの中で使う: うちのまちについて聞く・探す。要点は小さく ----------

function Inside({ c, sitekey, onChoose }: { c: Ctx; sitekey: string; onChoose: () => void }) {
  const { town, d, v, year } = c
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl p-2" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[26px] leading-tight font-bold sm:text-[30px]">{town.name}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{[c.vision, d.pop ? formatPeople(d.pop) : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={onChoose} className="shrink-0 text-[13px] text-muted-foreground hover:text-foreground">
          変える
        </button>
      </header>

      <section className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none">
        <h3 className="mb-2 text-[15px] font-bold">{town.name}について聞く</h3>
        <StartForm
          sitekey={sitekey}
          prefix={`${town.name}について。`}
          placeholder={`${town.name}について質問`}
          suggestions={['いちばんお金を使っている分野は？', `${reiwa(year)}に新しく始めた事業は？`, '子育てにいくら使っている？']}
        />
      </section>

      <section className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none">
        <h3 className="mb-2 text-[15px] font-bold">{town.name}の事業を探す</h3>
        <ProjectSearchBox code={town.code} size="md" placeholder="例：給食、プール、保育" />
        <div className="mt-2.5 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <Link key={x} href={searchHref(x, town.code)} className="rounded-full bg-secondary px-3 py-1 text-[13px] text-secondary-foreground transition-colors hover:bg-accent">
              {x}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm opacity-80">
              {reiwa(year)}の{v.word === '決算' ? '決算' : '当初予算'}
            </p>
            <p className="mt-1 text-[34px] leading-none font-bold">
              <Amt yen={v.total} />
            </p>
            {d.pop ? <p className="mt-1.5 text-[13px] opacity-80">1人あたり {perHeadText(v.total, d.pop)}</p> : null}
          </div>
          <YearSwitch c={c} onBrand />
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {v.fields.slice(0, 4).map((f) => (
            <li key={f.id}>
              <Link href={`${c.base}/fields/${f.id}`} className="block rounded-xl bg-brand-fill/20 px-3 py-2.5 transition-colors hover:bg-brand-fill/35">
                <span className="flex items-center gap-1.5 text-[12px] opacity-80">
                  <FieldIcon id={f.id} className="size-4" />
                  <span className="truncate">{f.name}</span>
                </span>
                <Amt yen={f.yen} className="mt-0.5 block text-base font-bold" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={c.base} className="inline-flex items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover">
            ページを見る
            <ArrowRightIcon className="size-4" />
          </Link>
          {v.comparable && v.newProjects.length ? (
            <Link href={`${c.base}/projects`} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] hover:bg-white/10 [&_svg]:size-5">
              <NewIcon />
              始めた事業 {v.newProjects.length}件
            </Link>
          ) : null}
        </div>
      </section>
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

function Choose({ entries, onPick, onCancel }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; onCancel?: () => void }) {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">まちのお金、何に使ってる？</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。</p>
      </header>
      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
        <p className="text-xl font-bold sm:text-2xl">住んでいるまちを選ぶ</p>
        <p className="mt-1 mb-4 text-sm opacity-80">選ぶと、そのまちのお金の使い道がここに並びます。</p>
        <TownPicker entries={entries} onPick={onPick} placeholder="自治体名で探す（例：品川）" />
        <LocateButton entries={entries} onPick={onPick} />
        {onCancel ? (
          <button type="button" onClick={onCancel} className="mt-3 text-[13px] opacity-80 hover:opacity-100">
            やめる
          </button>
        ) : null}
      </section>
    </>
  )
}

export function ProtoHome({ entries, featured, sitekey }: Props) {
  const { ready, town, recent, set } = useMyTown()
  const [changing, setChanging] = React.useState(false)
  const { current, key } = useVariant()
  const snap = useSnapshot(town?.code ?? null)
  const vision = town ? featured.find((f) => f.code === town.code)?.vision : undefined
  const pick = (e: MapEntry) => {
    set(toTown(e))
    setChanging(false)
  }
  const choose = () => setChanging(true)
  let body: React.ReactNode
  if (!ready) body = <Loading />
  else if (changing || (!town && current !== 1)) body = <Choose entries={entries} onPick={pick} onCancel={changing ? () => setChanging(false) : undefined} />
  else if (current === 1) body = <Seek entries={entries} town={town} recent={recent} snap={snap} onChoose={choose} />
  else if (current === 2) body = <WithCtx town={town!} vision={vision} snap={snap}>{(c) => <Inside c={c} sitekey={sitekey} onChoose={choose} />}</WithCtx>
  else
    body = (
      <>
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={choose} className="text-[13px] text-muted-foreground hover:text-foreground">
            うちのまちを変える
          </button>
        </div>
        <WithCtx town={town!} vision={vision} snap={snap}>{(c) => <Dashboard c={c} />}</WithCtx>
      </>
    )
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-20 pb-28 sm:px-8">
      {/* key は出し直しの動きのためだけ。データは上で持つ */}
      <div key={key}>{body}</div>
    </main>
  )
}
