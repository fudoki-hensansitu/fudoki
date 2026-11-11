// 試作: アプリのホーム。うちのまちを選ぶと、入口のボタンではなく、そのまちの今（総額・分野・新しく始めた事業・やめた事業・評価）を実データで出す。
// うちのまちは複数持て、上のチップで切り替える。データは自治体の頁と同じ /api/jurisdictions/app/:code を読み、yearView で年度ごとに見る
import * as React from 'react'
import { ArrowRightIcon, ArrowsLeftRightIcon, ClipboardTextIcon, CoinsIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem, LocateButton, Picker, type HomeProps } from '../home/home'
import type { MapEntry } from '../jurisdiction/index-table'
import { GRADES, yearView, type Snapshot } from '../jurisdiction/app/data'
import { NewIcon, StopIcon } from '../jurisdiction/fresh-icons'
import { formatPeople, reiwa } from '../jurisdiction/types'
import { Amt, FieldIcon, perHeadText } from './parts'
import { useMyTowns, type Town } from './towns'
import neighbors from './neighbors.json'

const toTown = (e: MapEntry): Town => ({ code: e.code, name: e.name, path: e.path })

/** まだ選んでいないときの、うちのまちを選ぶ面（今のホームと同じ緑の面） */
function Choose({ entries, onPick }: { entries: MapEntry[]; onPick: (e: MapEntry) => void }) {
  return (
    <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
      <p className="text-xl font-bold sm:text-2xl">住んでいるまちを選ぶ</p>
      <p className="mt-1 mb-4 text-sm opacity-80">選ぶと、そのまちのお金の使い道がここに並びます。働いているまちや実家のまちも足せます。</p>
      <Picker entries={entries} onPick={onPick} placeholder="自治体名で探す（例：品川）" />
      <LocateButton entries={entries} onPick={onPick} />
    </section>
  )
}

function Card({ title, icon, children, footer, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col rounded-2xl border bg-background p-5 animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold [&_svg]:size-5 [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="flex-1">{children}</div>
      {footer ? <div className="mt-3 border-t pt-3 text-[13px]">{footer}</div> : null}
    </section>
  )
}

const More = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
    {children}
    <ArrowRightIcon className="size-3.5" />
  </Link>
)

function Loading() {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2" aria-busy="true">
      <Skeleton className="h-44 rounded-[24px] md:col-span-2" />
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
      <p className="text-[13px] text-muted-foreground md:col-span-2">はじめて開くまちは、集めるのに少し時間がかかります。</p>
    </div>
  )
}

function Dashboard({ town, entries, vision }: { town: Town; entries: MapEntry[]; vision?: string }) {
  const [d, setD] = React.useState<Snapshot | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [year, setYear] = React.useState<number | null>(null)
  React.useEffect(() => {
    let alive = true
    setD(null)
    setFailed(false)
    fetch(`/api/jurisdictions/app/${town.code}`)
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
  }, [town.code])
  if (failed) return <p className="mt-6 text-sm text-muted-foreground">今はこのまちのデータを読み込めません。少し時間をおいて開き直してください。</p>
  if (!d || year == null) return <Loading />
  if (!d.years[String(year)]) return <p className="mt-6 text-sm text-muted-foreground">このまちの予算・決算は、まだ収録していません。</p>
  const v = yearView(d, year)
  const years = Object.keys(d.years).map(Number).sort((a, b) => a - b)
  const base = `${town.path}/${year}`
  const top = v.fields.slice(0, 6)
  const sheetYear = Math.max(0, ...d.sheets.map((s) => s.fy))
  const sheets = d.sheets.filter((s) => s.fy === sheetYear)
  const near = ((neighbors as Record<string, string[]>)[town.code] ?? []).flatMap((c) => entries.filter((e) => e.code === c))
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {/* 主張する面は1画面に1枚: まちの総額 */}
      <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7 md:col-span-2 animate-in fade-in duration-500 motion-reduce:animate-none">
        <div className="flex items-start gap-4">
          <Emblem code={town.code} name={town.name} className="size-14 rounded-2xl border-0 p-2" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold sm:text-[28px]">{town.name}</h2>
            <p className="mt-0.5 truncate text-sm opacity-80">
              {vision ?? ''}
              {vision && d.pop ? ' · ' : ''}
              {d.pop ? formatPeople(d.pop) : ''}
            </p>
          </div>
          <Link href={base} className="hidden shrink-0 items-center gap-1.5 rounded-full bg-brand-fill px-3.5 py-2 text-[13px] font-medium text-brand-fill-foreground transition-colors hover:bg-brand-fill-hover sm:inline-flex">
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
          {years.length > 1 ? (
            <div className="flex gap-1 rounded-full bg-brand-fill/20 p-1" role="group" aria-label="年度">
              {years.map((y) => (
                <button key={y} type="button" onClick={() => setYear(y)} aria-pressed={y === year} className={cn('rounded-full px-3 py-1 text-[13px] transition-colors', y === year ? 'bg-brand-fill text-brand-fill-foreground' : 'hover:bg-white/10')}>
                  R{y - 2018}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <Card title="何に使っている？" icon={<CoinsIcon />} footer={<More href={`${base}/${v.word === '決算' ? 'settlement' : 'budget'}`}>お金の流れを見る</More>}>
        <ul className="space-y-2.5">
          {top.map((f) => (
            <li key={f.id}>
              <Link href={`${base}/fields/${f.id}`} className="group block">
                <span className="flex items-center gap-2 text-sm">
                  <FieldIcon id={f.id} className="size-[18px] text-muted-foreground" />
                  <span className="flex-1 group-hover:text-primary">{f.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{((f.yen / v.total) * 100).toFixed(1)}%</span>
                  <Amt yen={f.yen} className="w-20 text-right text-sm font-medium" />
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-primary/70 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${(f.yen / v.total) * 100}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {v.comparable && v.newProjects.length ? (
        <Card title={`${reiwa(year)}に始めた事業`} icon={<NewIcon />} footer={<More href={`${base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.newProjects.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={v.newProjects.length - 5} />
        </Card>
      ) : (
        <Card title="お金のかかる事業" icon={<CoinsIcon />} footer={<More href={`${base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.current.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={0} />
        </Card>
      )}

      {v.comparable && v.ended.length ? (
        <Card title={`${reiwa(year - 1)}でやめた事業`} icon={<StopIcon />} footer={<More href={`${base}/projects`}>事業をすべて見る</More>}>
          <ProjectList items={v.ended.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p, String(year - 1)) ?? null }))} rest={v.ended.length - 5} />
        </Card>
      ) : null}

      {sheets.length ? (
        <Card title={`${reiwa(sheetYear)}の事業評価`} icon={<ClipboardTextIcon />} footer={<More href={`${town.path}/${sheetYear}/projects`}>評価した事業を見る</More>}>
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

      {near.length ? (
        <Card title="となりのまちと比べる" icon={<ArrowsLeftRightIcon />} className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {near.map((n) => (
              <Link key={n.code} href={`/prototype/compare?codes=${town.code},${n.code}`} className="inline-flex items-center gap-2 rounded-full border py-1 ps-1 pe-3 text-sm transition-colors hover:bg-card">
                <Emblem code={n.code} name={n.name} className="size-7 rounded-full border-0 p-1" />
                {n.name}
              </Link>
            ))}
            <Link href={`/prototype/compare?codes=${[town.code, ...near.slice(0, 3).map((n) => n.code)].join(',')}`} className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              まとめて比べる
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </Card>
      ) : null}
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

export function ProtoHome({ entries, featured }: HomeProps) {
  const { ready, towns, add, remove } = useMyTowns()
  const [active, setActive] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const town = towns.find((t) => t.code === active) ?? towns[0]
  const pick = (e: MapEntry) => {
    add(toTown(e))
    setActive(e.code)
    setAdding(false)
  }
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-28 sm:px-8 sm:pt-12">
      {!ready ? (
        <Loading />
      ) : !town ? (
        <>
          <header className="mb-6">
            <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">まちのお金、何に使ってる？</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。</p>
          </header>
          <Choose entries={entries} onPick={pick} />
        </>
      ) : (
        <>
          {/* うちのまちのチップ。押すと切り替え、＋でまちを足す */}
          <nav aria-label="うちのまち" className="flex flex-wrap items-center gap-2">
            {towns.map((t) => (
              <span key={t.code} className={cn('group inline-flex items-center rounded-full border text-sm transition-colors', t.code === town.code ? 'border-primary bg-accent text-accent-foreground' : 'bg-background hover:bg-card')}>
                <button type="button" onClick={() => setActive(t.code)} aria-pressed={t.code === town.code} className="inline-flex items-center gap-2 py-1 ps-1 pe-3">
                  <Emblem code={t.code} name={t.name} className="size-7 rounded-full border-0 p-1" />
                  {t.name}
                </button>
                {towns.length > 1 ? (
                  <button type="button" onClick={() => remove(t.code)} aria-label={`${t.name}を外す`} className="me-1 hidden size-6 place-items-center rounded-full text-muted-foreground group-hover:grid hover:bg-secondary">
                    <XIcon className="size-3.5" />
                  </button>
                ) : null}
              </span>
            ))}
            <button type="button" onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
              <PlusIcon className="size-4" />
              まちを足す
            </button>
          </nav>
          {adding ? (
            <div className="mt-3 max-w-md [&_[data-slot=input-group]]:border">
              <Picker entries={entries.filter((e) => !towns.some((t) => t.code === e.code))} onPick={pick} placeholder="自治体名で探す（例：目黒）" />
            </div>
          ) : null}
          <Dashboard key={town.code} town={town} entries={entries} vision={featured.find((f) => f.code === town.code)?.vision} />
        </>
      )}
    </main>
  )
}
