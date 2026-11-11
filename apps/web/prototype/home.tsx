// 試作: アプリのホーム。うちのまち（1つ）のお金の要点を、3つの違う組み方で見比べる（prototype skill。上のピッカーで切り替え）。
// 1 ダッシュボード: 要点をカードの格子で一覧する / 2 ストーリー: 1枚に1つの事実を大きく出し、横にめくる / 3 問いから: 住民の問いを並べ、押すと答えが開く。
// データは3案とも自治体の頁と同じ /api/jurisdictions/app/:code を読み、yearView で年度ごとに見る
import * as React from 'react'
import { ArrowRightIcon, ArrowsLeftRightIcon, CaretDownIcon, ClipboardTextIcon, CoinsIcon } from '@phosphor-icons/react'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Link } from '../nav/link'
import { Emblem, LocateButton, Picker as TownPicker, type HomeProps } from '../home/home'
import type { MapEntry } from '../jurisdiction/index-table'
import { GRADES, yearView, type Snapshot, type YearView } from '../jurisdiction/app/data'
import { NewIcon, StopIcon } from '../jurisdiction/fresh-icons'
import { formatPeople, reiwa } from '../jurisdiction/types'
import { Amt, FieldIcon, perHeadText } from './parts'
import { Picker, usePicker } from './picker'
import { useMyTown, type Town } from './towns'
import neighbors from './neighbors.json'

const VARIANTS = ['ダッシュボード', 'ストーリー', '問いから']
const toTown = (e: MapEntry): Town => ({ code: e.code, name: e.name, path: e.path })

// ---------- 3案で共通のもの ----------

/** うちのまちのデータ。年度は収録の最新から始める */
function useSnapshot(code: string) {
  const [d, setD] = React.useState<Snapshot | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [year, setYear] = React.useState<number | null>(null)
  React.useEffect(() => {
    let alive = true
    setD(null)
    setFailed(false)
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

type Ctx = { town: Town; d: Snapshot; v: YearView; year: number; years: number[]; setYear: (y: number) => void; near: MapEntry[]; base: string; vision?: string }

function buildCtx(town: Town, d: Snapshot, year: number, setYear: (y: number) => void, entries: MapEntry[], vision?: string): Ctx {
  const near = ((neighbors as Record<string, string[]>)[town.code] ?? []).flatMap((c) => entries.filter((e) => e.code === c))
  return { town, d, v: yearView(d, year), year, years: Object.keys(d.years).map(Number).sort((a, b) => a - b), setYear, near, base: `${town.path}/${year}`, vision }
}

const compareHref = (c: Ctx, codes = c.near.slice(0, 3).map((n) => n.code)) => `/prototype/compare?codes=${[c.town.code, ...codes].join(',')}`
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
          R{y - 2018}
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

function NearChips({ c }: { c: Ctx }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {c.near.map((n) => (
        <Link key={n.code} href={compareHref(c, [n.code])} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 ps-1 pe-3 text-sm transition-colors hover:bg-card">
          <Emblem code={n.code} name={n.name} className="size-7 rounded-full border-0 p-1" />
          {n.name}
        </Link>
      ))}
    </div>
  )
}

// ---------- 1 ダッシュボード ----------

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
    <div className="grid gap-3 md:grid-cols-2">
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
        <Card title={`${reiwa(fy)}の事業評価`} icon={<ClipboardTextIcon />} footer={<More href={`${town.path}/${fy}/projects`}>評価した事業を見る</More>}>
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
      {c.near.length ? (
        <Card title="となりのまちと比べる" icon={<ArrowsLeftRightIcon />} className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-3">
            <NearChips c={c} />
            <Link href={compareHref(c)} className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              まとめて比べる
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

// ---------- 2 ストーリー ----------

type Fact = { key: string; eyebrow: string; big: React.ReactNode; body: React.ReactNode; href: string; cta: string; brand?: boolean; icon?: React.ReactNode }

function facts(c: Ctx): Fact[] {
  const { v, d, year, town } = c
  const out: Fact[] = [
    {
      key: 'total',
      brand: true,
      eyebrow: `${reiwa(year)}の${v.word === '決算' ? '決算' : '当初予算'}`,
      big: <Amt yen={v.total} />,
      body: d.pop ? <>住んでいる人 1人あたり {perHeadText(v.total, d.pop)}</> : <>{town.name}の一般会計</>,
      href: c.base,
      cta: 'ページを見る',
    },
  ]
  const [f1, f2] = v.fields
  if (f1) out.push({ key: 'f1', icon: <FieldIcon id={f1.id} />, eyebrow: 'いちばん多いのは', big: f1.name, body: <>全体の {pct(f1.yen, v.total)}、<Amt yen={f1.yen} /> を使います。</>, href: `${c.base}/fields/${f1.id}`, cta: `${f1.name}の中身を見る` })
  if (f2) out.push({ key: 'f2', icon: <FieldIcon id={f2.id} />, eyebrow: '2番目は', big: f2.name, body: <>全体の {pct(f2.yen, v.total)}、<Amt yen={f2.yen} /> です。</>, href: `${c.base}/fields/${f2.id}`, cta: `${f2.name}の中身を見る` })
  const top = v.current[0]
  if (top) out.push({ key: 'top', icon: <CoinsIcon />, eyebrow: 'いちばんお金のかかる事業', big: top.name, body: <><Amt yen={v.amount(top)} /> を見込んでいます。</>, href: `${c.base}/projects`, cta: '事業を見る' })
  if (v.comparable && v.newProjects.length) {
    const p = v.newProjects[0]!
    out.push({ key: 'new', icon: <NewIcon />, eyebrow: `${reiwa(year)}に始めた事業`, big: <>{v.newProjects.length}<small className="ml-1 text-[0.45em]">件</small></>, body: <>いちばん大きいのは「{p.name}」（<Amt yen={v.amount(p)} />）。</>, href: `${c.base}/projects`, cta: '始めた事業を見る' })
  }
  if (v.comparable && v.ended.length) {
    const p = v.ended[0]!
    out.push({ key: 'end', icon: <StopIcon />, eyebrow: `${reiwa(year - 1)}でやめた事業`, big: <>{v.ended.length}<small className="ml-1 text-[0.45em]">件</small></>, body: <>いちばん大きかったのは「{p.name}」。</>, href: `${c.base}/projects`, cta: 'やめた事業を見る' })
  }
  const { fy, sheets } = sheetsOf(d)
  if (sheets.length) out.push({ key: 'eval', icon: <ClipboardTextIcon />, eyebrow: `${reiwa(fy)}の事業評価`, big: <>{sheets.length}<small className="ml-1 text-[0.45em]">件</small></>, body: <>区が自分で事業を振り返りました。「広げる」は {sheets.filter((s) => s.grade === 'A').length} 件。</>, href: `${town.path}/${fy}/projects`, cta: '評価を見る' })
  if (c.near.length) out.push({ key: 'near', icon: <ArrowsLeftRightIcon />, eyebrow: 'となりのまち', big: c.near.map((n) => n.name).join('・'), body: <>同じ年度の決算を、分野ごとに並べて見られます。</>, href: compareHref(c), cta: '比べる' })
  return out
}

function Story({ c }: { c: Ctx }) {
  const list = facts(c)
  const [api, setApi] = React.useState<CarouselApi>()
  const [at, setAt] = React.useState(0)
  React.useEffect(() => {
    if (!api) return
    const on = () => setAt(api.selectedScrollSnap())
    on()
    api.on('select', on)
    return () => void api.off('select', on)
  }, [api])
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Emblem code={c.town.code} name={c.town.name} className="size-10 rounded-xl" />
          <div>
            <h2 className="text-xl font-bold">{c.town.name}のお金</h2>
            {c.vision ? <p className="text-[13px] text-muted-foreground">{c.vision}</p> : null}
          </div>
        </div>
        <YearSwitch c={c} />
      </div>
      <Carousel setApi={setApi} opts={{ align: 'start' }} className="relative">
        <CarouselContent>
          {list.map((f) => (
            <CarouselItem key={`${c.year}-${f.key}`} className="basis-[88%] sm:basis-[62%]">
              <article className={cn('flex h-[320px] flex-col rounded-[24px] p-6 sm:p-7', f.brand ? 'bg-brand text-brand-foreground' : 'border bg-card')}>
                <p className={cn('flex items-center gap-2 text-sm [&_svg]:size-5', f.brand ? 'opacity-80' : 'text-muted-foreground')}>
                  {f.icon}
                  {f.eyebrow}
                </p>
                <p className={cn('mt-auto leading-[1.2] font-bold [overflow-wrap:anywhere]', typeof f.big === 'string' ? 'text-[28px] sm:text-[32px]' : 'text-[40px] sm:text-[48px]')}>{f.big}</p>
                <p className={cn('mt-3 text-[15px]', f.brand ? 'opacity-90' : 'text-muted-foreground')}>{f.body}</p>
                <Link href={f.href} className={cn('mt-5 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors', f.brand ? 'bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover' : 'bg-background text-foreground ring-1 ring-border hover:bg-secondary')}>
                  {f.cta}
                  <ArrowRightIcon className="size-4" />
                </Link>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="-left-3 hidden sm:flex" />
        <CarouselNext className="-right-3 hidden sm:flex" />
      </Carousel>
      <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
        {list.map((f, i) => (
          <span key={f.key} className={cn('h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out', i === at ? 'w-5 bg-primary' : 'w-1.5 bg-border')} />
        ))}
      </div>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        {at + 1} / {list.length}・横にめくると次の事実へ
      </p>
    </div>
  )
}

// ---------- 3 問いから ----------

type Question = { key: string; q: string; preview: React.ReactNode; answer: React.ReactNode }

function questions(c: Ctx): Question[] {
  const { v, d, year, town } = c
  const out: Question[] = [
    {
      key: 'total',
      q: `${town.name}は、${reiwa(year)}に全部でいくら使う？`,
      preview: <Amt yen={v.total} className="font-bold text-primary" />,
      answer: (
        <>
          <p className="text-[15px]">
            {v.word === '決算' ? '決算' : '当初予算'}で <Amt yen={v.total} className="font-bold" />
            {d.pop ? <>。住んでいる {formatPeople(d.pop)}で割ると、1人あたり {perHeadText(v.total, d.pop)}です。</> : '。'}
          </p>
          <More href={c.base} className="mt-3">
            {town.name}のページを見る
          </More>
        </>
      ),
    },
  ]
  const f1 = v.fields[0]
  if (f1)
    out.push({
      key: 'fields',
      q: 'いちばんお金を使っているのは？',
      preview: <span className="text-sm">{f1.name}</span>,
      answer: (
        <>
          <FieldBars c={c} limit={5} />
          <More href={flowHref(c)} className="mt-4">
            お金の流れを見る
          </More>
        </>
      ),
    })
  if (v.comparable && v.newProjects.length)
    out.push({
      key: 'new',
      q: `${reiwa(year)}に新しく始めたことは？`,
      preview: <span className="text-sm tabular-nums">{v.newProjects.length}件</span>,
      answer: (
        <>
          <ProjectList items={v.newProjects.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={v.newProjects.length - 5} />
          <More href={`${c.base}/projects`} className="mt-3">
            事業をすべて見る
          </More>
        </>
      ),
    })
  if (v.comparable && v.ended.length)
    out.push({
      key: 'end',
      q: `${reiwa(year - 1)}でやめたことは？`,
      preview: <span className="text-sm tabular-nums">{v.ended.length}件</span>,
      answer: (
        <>
          <ProjectList items={v.ended.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p, String(year - 1)) ?? null }))} rest={v.ended.length - 5} />
          <More href={`${c.base}/projects`} className="mt-3">
            事業をすべて見る
          </More>
        </>
      ),
    })
  if ((!v.comparable || !v.newProjects.length) && v.current.length)
    out.push({
      key: 'top',
      q: 'いちばんお金のかかる事業は？',
      preview: <span className="max-w-40 truncate text-sm">{v.current[0]?.name}</span>,
      answer: (
        <>
          <ProjectList items={v.current.slice(0, 5).map((p) => ({ id: p.id, name: p.name, yen: v.amount(p) ?? null }))} rest={0} />
          <More href={`${c.base}/projects`} className="mt-3">
            事業をすべて見る
          </More>
        </>
      ),
    })
  const { fy, sheets } = sheetsOf(d)
  if (sheets.length)
    out.push({
      key: 'eval',
      q: '事業を、どう振り返った？',
      preview: <span className="text-sm tabular-nums">{sheets.length}件</span>,
      answer: (
        <>
          <ul className="grid grid-cols-4 gap-2">
            {GRADES.map(([g, label]) => (
              <li key={g} className="rounded-xl bg-card px-2 py-2.5 text-center">
                <span className="block text-lg font-bold tabular-nums">{sheets.filter((s) => s.grade === g).length}</span>
                <span className="block text-[11px] text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
          <More href={`${town.path}/${fy}/projects`} className="mt-3">
            {reiwa(fy)}の評価を見る
          </More>
        </>
      ),
    })
  if (c.near.length)
    out.push({
      key: 'near',
      q: 'となりのまちと比べると？',
      preview: <span className="text-sm">{c.near.length}つのまち</span>,
      answer: (
        <>
          <NearChips c={c} />
          <More href={compareHref(c)} className="mt-3">
            まとめて比べる
          </More>
        </>
      ),
    })
  return out
}

function Questions({ c }: { c: Ctx }) {
  const list = questions(c)
  const [open, setOpen] = React.useState<string | null>(list[0]?.key ?? null)
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Emblem code={c.town.code} name={c.town.name} className="size-10 rounded-xl" />
          <h2 className="text-xl font-bold">{c.town.name}に聞いてみる</h2>
        </div>
        <YearSwitch c={c} />
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-background">
        {list.map((q) => {
          const isOpen = open === q.key
          return (
            <li key={q.key}>
              <button type="button" onClick={() => setOpen(isOpen ? null : q.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-card">
                <span className="flex-1 text-[15px] font-medium">{q.q}</span>
                <span className={cn('shrink-0 text-muted-foreground transition-opacity duration-150', isOpen && 'opacity-0')}>{q.preview}</span>
                <CaretDownIcon className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out', isOpen && 'rotate-180')} />
              </button>
              {/* 高さは grid の 0fr → 1fr で開く */}
              <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div className="overflow-hidden">
                  <div className="px-5 pt-1 pb-5">{q.answer}</div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
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

function Body({ town, entries, vision, variant }: { town: Town; entries: MapEntry[]; vision?: string; variant: number }) {
  const { d, failed, year, setYear } = useSnapshot(town.code)
  if (failed) return <p className="text-sm text-muted-foreground">今はこのまちのデータを読み込めません。少し時間をおいて開き直してください。</p>
  if (!d || year == null) return <Loading />
  if (!d.years[String(year)]) return <p className="text-sm text-muted-foreground">このまちの予算・決算は、まだ収録していません。</p>
  const c = buildCtx(town, d, year, setYear, entries, vision)
  return variant === 1 ? <Story c={c} /> : variant === 2 ? <Questions c={c} /> : <Dashboard c={c} />
}

export function ProtoHome({ entries, featured }: HomeProps) {
  const { ready, town, set } = useMyTown()
  const [changing, setChanging] = React.useState(false)
  const picker = usePicker(VARIANTS)
  const pick = (e: MapEntry) => {
    set(toTown(e))
    setChanging(false)
  }
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-20 pb-28 sm:px-8">
      <Picker names={VARIANTS} current={picker.current} select={picker.select} replay={picker.replay} />
      {!ready ? (
        <Loading />
      ) : !town || changing ? (
        <>
          <header className="mb-6">
            <h1 className="text-[26px] leading-[1.35] font-bold tracking-[0.02em] sm:text-[32px]">まちのお金、何に使ってる？</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">自治体が何にいくら使い、どう振り返ったかを、事業ごとに見られます。</p>
          </header>
          <section className="rounded-[24px] bg-brand p-5 text-brand-foreground sm:p-7">
            <p className="text-xl font-bold sm:text-2xl">住んでいるまちを選ぶ</p>
            <p className="mt-1 mb-4 text-sm opacity-80">選ぶと、そのまちのお金の使い道がここに並びます。</p>
            <TownPicker entries={entries} onPick={pick} placeholder="自治体名で探す（例：品川）" />
            <LocateButton entries={entries} onPick={pick} />
            {changing ? (
              <button type="button" onClick={() => setChanging(false)} className="mt-3 text-[13px] opacity-80 hover:opacity-100">
                やめる
              </button>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={() => setChanging(true)} className="text-[13px] text-muted-foreground hover:text-foreground">
              うちのまちを変える
            </button>
          </div>
          <Body key={`${town.code}-${picker.key}`} town={town} entries={entries} vision={featured.find((f) => f.code === town.code)?.vision} variant={picker.current} />
        </>
      )}
    </main>
  )
}
