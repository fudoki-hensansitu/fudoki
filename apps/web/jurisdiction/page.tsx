// 自治体の個別ページ（/:都道府県/:名称）の島。サーバーが書いた HTML（検索エンジン向け）を、同じデータで描き直す。
// 型は企業のプロフィールページ: ヘッダー（ロゴ・名前・一文・属性）＋年度のタブ＋左の目次＋見出し付きの節。年度を切り替えるとページ全体がその年度になる。
// 歳出の決算は API の値。方針・政策領域・事業の入れ替えは jurisdiction/profiles.ts の手で起こした値で、ある自治体・年度だけ節を出す
import { Link } from '@void/react'
import * as React from 'react'
import { ArrowUpRightIcon, CaretDownIcon, ChatCircleIcon, GlobeIcon, MapPinIcon, NotePencilIcon, QuotesIcon, UsersIcon, XIcon } from '@phosphor-icons/react'
import { StartForm } from '../chat/start-form'
import type { StoredSession } from '../chat/store'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Flow } from './flow'
import { assetPath, type Domain, type PolicyProject, type Profile, type ProfileYear, type ProjectStatus, type Scrap } from './profiles'
import { changePct, formatYen, INDEX_PATH, reiwa, yearName, type PageData, type Project, type Setsu, type YearTotal } from './types'

const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

const BADGE: Record<ProjectStatus, { label: string; className: string }> = {
  short: { label: '目標に届いていない', className: 'bg-[color-mix(in_srgb,var(--kincha)_22%,transparent)] text-[#aa5910]' },
  met: { label: '目標に届いた', className: 'bg-primary/15 text-primary' },
  mixed: { label: '達成と未達が混在', className: 'bg-secondary' },
  none: { label: '評価前', className: 'border border-dashed' },
}

/** aside は見出しの横に並べる短い値（決算の総額など） */
type SectionLink = { href: string; label: string }
/** link は見出しの右に出す出典（PDF を直接開く）。複数あれば並べる */
const Section = ({ id, title, aside, link, children }: { id: string; title: string; aside?: React.ReactNode; link?: SectionLink | SectionLink[]; children: React.ReactNode }) => (
  <section id={id} aria-labelledby={`h-${id}`} className="flex scroll-mt-32 md:scroll-mt-20 flex-col gap-4">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 id={`h-${id}`} className="font-sans text-[26px] font-normal leading-snug">
          {title}
        </h2>
        {aside}
      </div>
      {link ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Array.isArray(link) ? link : [link]).map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-primary no-underline hover:underline">
              {l.label}
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
    {children}
  </section>
)

function Policies({ code, year }: { code: string; year: ProfileYear }) {
  return (
    <Section id="policy" title="方針" link={{ href: year.policySource, label: '予算編成方針' }}>
      <ol className="border-t">
        {year.policies.map((p, i) => (
          <li key={p.title} className="grid grid-cols-[22px_104px_minmax(0,1fr)] items-start gap-3 border-b border-foreground/10 py-3.5 sm:grid-cols-[28px_176px_minmax(0,1fr)] sm:gap-4">
            <span className="text-lg text-primary">{i + 1}</span>
            <img src={assetPath(code, p.image)} alt="" loading="lazy" className="aspect-video w-full rounded-lg border border-foreground/10 object-cover" />
            <div>
              <b className="block text-base font-normal">{p.title}</b>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function ProjectItem({ p }: { p: PolicyProject }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-b border-foreground/10 py-4 md:grid-cols-[minmax(0,1fr)_210px]">
      <div className="text-[15.5px]">
        {p.name}
        {p.status ? <span className={`ml-1.5 whitespace-nowrap rounded-full px-2 py-px align-middle text-xs ${BADGE[p.status].className}`}>{BADGE[p.status].label}</span> : null}
      </div>
      <p className="text-sm md:col-start-1">{p.what}</p>
      {p.evaluation ? (
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground md:col-start-1">
          <span>区の評価</span>
          <span>
            {p.evaluation.grade ? <b className="font-normal text-foreground">{p.evaluation.grade}</b> : null}
            {p.evaluation.grade ? '・' : ''}
            {p.evaluation.note}
          </span>
        </p>
      ) : null}
      <div className="flex flex-row flex-wrap gap-x-3 gap-y-1 text-sm md:col-start-2 md:row-span-3 md:row-start-1 md:flex-col md:gap-0.5 md:text-right">
        {p.amounts.map((a) => (
          <span key={`${a.yen}-${a.label ?? ''}`} className="tabular-nums">
            {formatYen(a.yen)}
            {a.label ? <small className="ml-1 text-xs text-muted-foreground md:ml-0 md:block">{a.label}</small> : null}
          </span>
        ))}
      </div>
    </div>
  )
}

function Domains({ domains }: { domains: Domain[] }) {
  return (
    <Section id="domains" title="政策領域">
      {domains.map((d) => (
        <div key={d.id} id={`d-${d.id}`} className="flex scroll-mt-32 md:scroll-mt-20 flex-col gap-1 [&+&]:mt-12">
          <h3 className="mb-3.5 border-l-4 border-primary py-0.5 pl-3.5 text-[19px] leading-snug sm:text-[22px]">{d.name}</h3>
          <div className="border-t">
            {d.projects.length ? (
              d.projects.map((p) => <ProjectItem key={p.name} p={p} />)
            ) : (
              <p className="border-b border-foreground/10 py-4 text-sm text-muted-foreground">この年度の新規・拡充事業の中から、この領域に振り分けた事業はありません。</p>
            )}
          </div>
        </div>
      ))}
    </Section>
  )
}

function ProjectRow({ p, rank, max }: { p: Project; rank: number; max: number }) {
  const [setsu, setSetsu] = React.useState<Setsu[]>()
  const [error, setError] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const pct = changePct(p.yen, p.prevYen)
  // 内訳（節の上位）は開閉せず最初から出す
  React.useEffect(() => {
    const controller = new AbortController()
    setError(false)
    fetchJson<Setsu[]>(`/api/jurisdictions/setsu/${p.id}`, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setSetsu(value) },
      () => { if (!controller.signal.aborted) setError(true) },
    )
    return () => controller.abort()
  }, [p.id, attempt])
  return (
    <li className="border-b border-foreground/10">
      <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-3 sm:grid-cols-[22px_minmax(120px,190px)_1fr_110px_90px]">
        <span className="text-xl text-muted-foreground">{rank}</span>
        <div className="min-w-0">
          <b className="block text-[15px] font-normal leading-snug">{p.name}</b>
          <span className="text-xs text-muted-foreground">{p.kanName}</span>
        </div>
        <div className="order-5 col-span-full sm:order-none sm:col-span-1">
          <div className="h-2.5 overflow-hidden rounded-full bg-foreground/5">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(p.yen / max) * 100}%` }} />
          </div>
        </div>
        <div className="text-right text-[15px] tabular-nums">{p.amountMissing ? '金額未記載' : formatYen(p.yen)}</div>
        <div className={`hidden text-right text-[15px] tabular-nums sm:block ${pct !== null && pct < 0 ? 'text-[#aa5910]' : 'text-primary'}`}>
          {pct === null ? '—' : `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}
          <i className="block text-[11px] not-italic text-muted-foreground">前年度比</i>
        </div>
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 pb-3 pl-9 text-[13px] text-destructive">
          <span>内訳を読み込めませんでした。</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline underline-offset-2">もう一度読み込む</button>
        </div>
      ) : setsu && setsu.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-0.5 pb-3 pl-9 text-[12.5px] text-muted-foreground">
          {setsu.map((s) => (
            <li key={s.name}>
              {s.name}
              <b className="ml-1.5 font-normal tabular-nums text-foreground">{s.amountMissing ? '金額未記載' : formatYen(s.yen)}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** データが無いところに置く枠。データがある年度と同じ場所に、どれも同じ高さで出す */
const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="grid place-items-center rounded-[20px] border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">{children}</div>
)

/** どの年度も同じ並び（総額・お金の流れ・金額の大きい事業）。決算が無い年度・事業の一覧が無い年度は枠だけ出す */
type Phase = 'settlement' | 'budget'
const PHASES: { key: Phase; label: string }[] = [
  { key: 'settlement', label: '決算' },
  { key: 'budget', label: '予算' },
]

/** 予算の節。決算と予算をタブで切り替える。予算はまだ取り込んでいないので、どの年度も空の枠を出す */
function Budget({ data, year }: { data: PageData; year: number }) {
  const [phase, setPhase] = React.useState<Phase>('settlement')
  const settled = data.years.find((y) => y.year === year)
  const total = phase === 'settlement' ? settled : undefined
  const prev = data.years.find((y) => y.year === year - 1)
  const pct = total ? changePct(total.yen, prev?.yen) : null
  const label = phase === 'settlement' ? '決算' : '予算'
  const missing = `${yearName(year)}の${label}は、まだ収録していません`
  // その年度の決算書・予算書（歳出を載せた冊）の PDF を直接開く。公表前・未選定の冊は出さない
  const documents = data.profile?.years[year]?.documents
  const docs = [...(documents?.settlement ?? []), ...(documents?.initial ?? [])]
  const summary = (
    <>
      <span className="text-sm text-muted-foreground">全体</span>
      <b className={`text-[26px] font-normal leading-snug tabular-nums ${total ? '' : 'text-muted-foreground'}`}>{total ? formatYen(total.yen) : '—'}</b>
      {pct !== null ? <span className={`text-[13px] tabular-nums ${pct < 0 ? 'text-[#aa5910]' : 'text-primary'}`}>前年度比 {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span> : null}
    </>
  )
  const tabs = (
    <div role="tablist" aria-label="金額の段階" className="flex gap-1">
      {PHASES.map((p) => (
        <button
          key={p.key}
          type="button"
          role="tab"
          id={`tab-${p.key}`}
          aria-selected={p.key === phase}
          aria-controls="budget-panel"
          onClick={() => setPhase(p.key)}
          className={`rounded-full px-3 py-1.5 text-[13px] ${p.key === phase ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
  return (
    <Section
      id="budget"
      title="決算 / 予算"
      link={docs.length ? docs : undefined}
    >
      <div id="budget-panel" role="tabpanel" aria-labelledby={`tab-${phase}`} data-ask-view={`${reiwa(year)}の${label}の金額`} className="flex flex-col gap-4">
        {total ? (
          <Flow key={year} data={data} total={total} tabs={tabs} summary={summary} />
        ) : (
          <div className="rounded-[20px] border bg-background px-5 pt-5 sm:px-6">
            {tabs}
            <div className="mt-3 flex min-h-9 flex-wrap items-baseline gap-x-3">{summary}</div>
            <p className="pb-10 pt-4 text-center text-sm text-muted-foreground">{missing}</p>
          </div>
        )}
      </div>
    </Section>
  )
}

/** 決算の金額が大きい事業（目）。最新の決算の年度だけ出す */
function Projects({ data, year }: { data: PageData; year: number }) {
  const settled = data.years.find((y) => y.year === year)
  const isLatest = !!settled && settled.year === data.years.at(-1)?.year
  const max = data.projects[0]?.yen ?? 1
  return (
    <Section id="projects" title="金額の大きい事業">
      {isLatest ? (
        <ul className="border-t">
          {data.projects.map((p, i) => (
            <ProjectRow key={p.id} p={p} rank={i + 1} max={max} />
          ))}
        </ul>
      ) : (
        <Empty>{settled ? `${yearName(year)}の事業の一覧は、まだ出していません` : `${yearName(year)}の決算は、まだ収録していません`}</Empty>
      )}
    </Section>
  )
}

function ScrapSection({ scrap }: { scrap: Scrap }) {
  const target = scrap.targetYen
  const grades = [
    ['A', '広げる'],
    ['B', '今のまま続ける'],
    ['C', 'やり方を見直す'],
    ['D', 'やめる・終える'],
  ] as const
  return (
    <Section id="scrap" title="事業の入れ替え">
      <div className="flex max-w-[560px] flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span>スクラップで捻出した財源</span>
          <b className="text-[28px] font-normal tabular-nums">
            {formatYen(scrap.raisedYen)}
            {target ? <small className="ml-1 text-sm text-muted-foreground">／ 目標 {formatYen(target)}</small> : null}
          </b>
        </div>
        {target ? (
          <div className="relative h-2.5 rounded-full bg-foreground/5" role="img" aria-label={`目標${formatYen(target)}に対して${formatYen(scrap.raisedYen)}`}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--kincha)]" style={{ width: `${Math.min(1, scrap.raisedYen / target) * 100}%` }} />
            <div className="absolute -top-1 right-0 h-[18px] w-0.5 bg-foreground" />
          </div>
        ) : null}
      </div>
      <h3 className="text-lg">{scrap.evaluated.toLocaleString('ja-JP')}事業の自己評価</h3>
      <div className="grid grid-cols-2 border-t sm:grid-cols-4">
        {grades.map(([g, label]) => (
          <div key={g} className="flex flex-col py-3">
            <b className="text-2xl font-normal leading-snug tabular-nums">{scrap.grades[g]}</b>
            <span className="text-[13px] text-muted-foreground">{g} {label}</span>
          </div>
        ))}
      </div>
      <h3 className="text-lg">やめた事業</h3>
      <ul className="border-t">
        {scrap.exits.map((e) => (
          <li key={e.name} className="grid grid-cols-[minmax(0,1fr)_72px] items-baseline gap-x-4 gap-y-1 border-b border-foreground/10 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_80px]">
            <span>{e.name}</span>
            <span className="col-span-full row-start-2 text-[13.5px] text-muted-foreground sm:col-span-1 sm:row-start-auto">{e.reason}</span>
            <span className="text-right text-[13px] text-muted-foreground">{e.result}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

interface TocItem {
  href: string
  label: string
  sub?: boolean
}

/** 直近の3年度は並べ、それより前は一つのメニューにまとめる */
const RECENT_YEARS = 3

function YearPicker({ years, current, onChange }: { years: number[]; current: number; onChange: (y: number) => void }) {
  const recent = years.slice(0, RECENT_YEARS)
  const older = years.slice(RECENT_YEARS)
  const olderPicked = older.includes(current)
  const pill = (on: boolean) => `rounded-full px-2.5 py-1.5 text-[13px] ${on ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`
  return (
    <div role="group" aria-label="年度" className="flex gap-1">
      {recent.map((y) => (
        <button key={y} type="button" aria-pressed={y === current} onClick={() => onChange(y)} title={reiwa(y)} className={pill(y === current)}>
          {yearName(y)}
          {yearName(y) !== reiwa(y) ? <span className="hidden text-muted-foreground lg:inline">（{reiwa(y).replace(/度$/, '')}）</span> : null}
        </button>
      ))}
      {older.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger className={`inline-flex items-center gap-0.5 ${pill(olderPicked)}`}>
            {olderPicked ? reiwa(current) : 'それより前'}
            <CaretDownIcon className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuRadioGroup value={olderPicked ? String(current) : ''} onValueChange={(v) => onChange(Number(v))}>
              {older.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)}>{reiwa(y)}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

const yearFromHash = () => Number(/^#y(\d{4})$/.exec(location.hash)?.[1]) || undefined

export function Page({ data, sitekey }: { data: PageData; sitekey: string }) {
  const profile = data.profile ?? null
  const years = React.useMemo(() => [...new Set([...Object.keys(profile?.years ?? {}).map(Number), ...data.years.map((y) => y.year)])].sort((a, b) => b - a), [data, profile])
  // サーバーで書いた HTML と同じ年度で始め、URL の #y2025 は描いたあとに反映する（hydration の食い違いを避ける）
  const [year, setYear] = React.useState(years[0]!)
  React.useEffect(() => {
    const y = yearFromHash()
    if (y && years.includes(y)) setYear(y)
  }, [years])
  const py = profile?.years[String(year)]
  const choose = (y: number) => {
    setYear(y)
    history.replaceState(null, '', `#y${y}`)
  }

  const toc: TocItem[] = [
    ...(py ? [{ href: '#policy', label: '方針' }, { href: '#domains', label: '政策領域' }, ...py.domains.map((d) => ({ href: `#d-${d.id}`, label: d.short ?? d.name, sub: true }))] : []),
    { href: '#budget', label: '決算 / 予算' },
    { href: '#projects', label: '事業' },
    ...(py?.scrap ? [{ href: '#scrap', label: '事業の入れ替え' }] : []),
  ]

  // スクロールしたら小さなヘッダーを出す
  const title = React.useRef<HTMLHeadingElement>(null)
  const [mini, setMini] = React.useState(false)
  React.useEffect(() => {
    const el = title.current
    if (!el) return
    const observer = new IntersectionObserver(([e]) => setMini(!e!.isIntersecting && e!.boundingClientRect.top < 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 目次をスクロールに追従させる
  const [current, setCurrent] = React.useState<string>()
  const tocKey = toc.map((t) => t.href).join()
  React.useEffect(() => {
    const targets = toc.map((t) => document.querySelector<HTMLElement>(t.href)).filter((t): t is HTMLElement => !!t)
    let frame = 0
    const spy = () => {
      frame = 0
      let cur = targets[0]
      for (const t of targets) if (t.getBoundingClientRect().top <= 160) cur = t
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = targets.at(-1)
      setCurrent(cur ? `#${cur.id}` : undefined)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(spy) }
    spy()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocKey, year])
  // 目次の移動で #yYYYY を節の fragment に置き換えない（再読み込みで年度が戻らないように）
  const jump = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.querySelector(e.currentTarget.getAttribute('href')!)
    if (!target) return
    e.preventDefault()
    target.scrollIntoView()
  }
  const isCurrent = (href: string) => href === current || (href === '#domains' && !!current?.startsWith('#d-'))
  const spBar = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    const bar = spBar.current
    const a = bar?.querySelector<HTMLElement>('[data-current]')
    if (bar && a) bar.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' })
  }, [current])

  const tagline = py?.tagline
  const logo = profile?.logo ? assetPath(data.code, profile.logo) : null

  return (
    <>
      <div className={`fixed left-0 right-(--side-panel,0px) top-0 z-30 md:left-(--nav-w) border-b bg-background transition-[transform,right] duration-200 ease-out motion-reduce:transition-none ${mini ? '' : '-translate-y-full'}`} aria-hidden={!mini} inert={!mini}>
        <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-3 px-4">
          <span className="hidden size-10 shrink-0 place-items-center rounded-lg border bg-white p-1 sm:grid">{logo ? <img src={logo} alt="" className="w-full" /> : <span className="text-foreground">{data.name[0]}</span>}</span>
          <b className={`shrink-0 font-normal ${tagline ? 'text-sm text-muted-foreground' : 'text-lg'}`}>{data.name}</b>
          {tagline ? <span className="hidden min-w-0 truncate text-[15px] sm:block">{tagline}</span> : null}
          {years.length > 1 ? (
            <div className="ml-auto shrink-0">
              <YearPicker years={years} current={year} onChange={choose} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-4 pb-48">
        <header className="relative grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 border-b py-7 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-7">
          {years.length > 1 ? (
            <div className="col-span-full -mb-2 justify-self-end sm:absolute sm:right-0 sm:top-7 sm:mb-0">
              <YearPicker years={years} current={year} onChange={choose} />
            </div>
          ) : null}
          <div className="grid size-20 place-items-center rounded-xl border bg-white p-2.5 sm:size-[132px] sm:rounded-2xl sm:p-[18px]">
            {logo ? <img src={logo} alt={data.name} className="h-auto w-full" /> : <span className="text-3xl text-foreground sm:text-5xl">{data.name[0]}</span>}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {/* 一文（方針の要約）がある年度は名前を小さく一文を大きく見せる。無い自治体・年度は名前を大きく。h1 は名前のまま */}
            <h1 ref={title} className={tagline ? 'text-lg font-normal leading-tight text-muted-foreground sm:text-xl' : 'text-[clamp(2rem,1.5rem+2vw,2.8rem)] font-normal leading-tight'}>{data.name}</h1>
            {tagline ? <p className="text-[clamp(1.5rem,1.1rem+1.6vw,2.4rem)] leading-snug [text-wrap:pretty] [word-break:auto-phrase]">{tagline}</p> : null}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-4" aria-hidden="true" />
                <Link href={INDEX_PATH} className="text-primary no-underline">{data.prefecture}</Link>
              </span>
              {profile?.population ? (
                <span className="inline-flex items-center gap-1.5" title="人口">
                  <UsersIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">人口 </span>
                  {(profile.population.people / 1e4).toFixed(1)}万人
                </span>
              ) : null}
              {profile?.site ? (
                <span className="inline-flex items-center gap-1.5">
                  <GlobeIcon className="size-4" aria-hidden="true" />
                  <a href={profile.site} target="_blank" rel="noopener" className="text-primary no-underline">公式サイト</a>
                </span>
              ) : null}
            </div>
            {profile?.tags.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((t) => (
                  <span key={t} className="rounded-full bg-secondary px-3.5 py-0.5 text-[13px]">{t}</span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <nav ref={spBar} aria-label="目次" className={`sticky z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b bg-background px-4 py-2.5 [scrollbar-width:none] md:hidden ${mini ? 'top-[61px]' : 'top-0'}`}>
          {toc.filter((t) => !t.sub).map((t) => (
            <a key={t.href} href={t.href} onClick={jump} data-current={isCurrent(t.href) || undefined} className="shrink-0 rounded-full border px-3 py-1 text-[13px] text-muted-foreground no-underline data-[current]:border-primary data-[current]:bg-primary data-[current]:text-primary-foreground">
              {t.label}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-12 pt-6 md:grid-cols-[220px_minmax(0,1fr)] md:pt-8">
          <nav aria-label="目次" className="sticky top-[84px] hidden flex-col gap-0.5 self-start md:flex">
            {toc.map((t) => (
              <a
                key={t.href}
                href={t.href}
                onClick={jump}
                data-current={isCurrent(t.href) || undefined}
                className={`relative block rounded-lg px-3.5 py-2 no-underline hover:bg-card data-[current]:bg-card data-[current]:text-foreground data-[current]:before:absolute data-[current]:before:inset-y-2 data-[current]:before:left-0 data-[current]:before:w-[3px] data-[current]:before:rounded-sm data-[current]:before:bg-primary ${t.sub ? 'pl-7 text-[13.5px] text-muted-foreground' : 'text-[15px]'}`}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <main className="flex min-w-0 flex-col gap-14">
            {py ? <Policies code={data.code} year={py} /> : null}
            {py ? <Domains domains={py.domains} /> : null}
            <Budget data={data} year={year} />
            <Projects data={data} year={year} />
            {py?.scrap ? <ScrapSection scrap={py.scrap} /> : null}
          </main>
        </div>
      </div>

      <AskDock name={data.name} sitekey={sitekey} year={year} section={toc.find((t) => isCurrent(t.href))?.label} />
    </>
  )
}

/** AI に聞く入力欄。最初は開いておき、読み進めるか Escape で右下のボタンに畳む。押すか「/」で開く。
 * 送ると頁を移らずに会話を開く。広い画面では右の side panel（頁は読み続けられる）、スマホでは下からの drawer。閉じても会話は残り、右下のボタンで戻れる */
const DOCK_CLOSE_AFTER = 80
/** 選んだ文として AI に渡す長さの上限 */
const QUOTE_MAX = 600
/** drawer の取っ手をこれだけ下へ引いたら閉じる */
const DRAWER_DRAG_CLOSE = 80
/** これより広い画面では右の side panel にする（Tailwind の md）。幅は SIDE_WIDTH */
const WIDE_QUERY = '(min-width: 768px)'
const SIDE_WIDTH = 440

const Conversation = React.lazy(() => import('../chat/conversation').then((m) => ({ default: m.Conversation })))

/** 画面に見えている data-ask-view の印を、頁の順に読む */
const visibleViews = () =>
  [...document.querySelectorAll<HTMLElement>('[data-ask-view]')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0
    })
    .map((el) => el.dataset.askView!)

function AskDock({ name, sitekey, year, section }: { name: string; sitekey: string; year: number; section?: string }) {
  const [open, setOpen] = React.useState(true)
  const [chat, setChat] = React.useState<{ id: string; session: StoredSession }>()
  const [drawer, setDrawer] = React.useState(false)
  const [quote, setQuote] = React.useState('')
  const dock = React.useRef<HTMLDivElement>(null)
  const sheet = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const anchor = React.useRef(0)
  /** 入力欄に focus した時刻。スマホでは focus で頁が動くので、その直後のスクロールでは閉じない */
  const focusedAt = React.useRef(0)
  const show = React.useCallback(() => {
    if (chat) return setDrawer(true)
    anchor.current = window.scrollY
    setOpen(true)
    requestAnimationFrame(() => dock.current?.querySelector<HTMLElement>('textarea, input')?.focus())
  }, [chat])
  React.useEffect(() => {
    if (!open || chat) return
    // 頁でもカードの中でも、スクロールしたら閉じる（上へ戻しても閉じる）。入力欄に書きかけの文があるときだけ残す
    const close = () => {
      const field = dock.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')
      if (field?.value.trim()) return
      if (field && document.activeElement === field) field.blur()
      setOpen(false)
    }
    const onScroll = (e: Event) => {
      if (Date.now() - focusedAt.current < 800) { anchor.current = window.scrollY; return }
      const target = e.target
      if (target === document || target === document.documentElement) {
        if (Math.abs(window.scrollY - anchor.current) > DOCK_CLOSE_AFTER) close()
      } else if (target instanceof Node && !dock.current?.contains(target)) close()
    }
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [open, chat])

  // 頁の文を選んだら、その文を質問の文脈に入れる。入力欄を押して選択が外れても残し、頁の別の所を押したら外す
  React.useEffect(() => {
    const onSelect = () => {
      const sel = document.getSelection()
      const node = sel?.anchorNode
      const inside = (n: Node | null | undefined) => !!n && (dock.current?.contains(n) || sheet.current?.contains(n))
      if (inside(node)) return
      const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, ' ').trim() : ''
      setQuote(text.slice(0, QUOTE_MAX))
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [])

  const describe = () => {
    const views = [...new Set(visibleViews())]
    return [
      `${name}の頁（${location.pathname}）を見ている`,
      `年度: ${reiwa(year)}（${year}年度）`,
      section ? `いま読んでいる節: ${section}` : '',
      views.length ? `画面に出ているもの: ${views.join('、')}` : '',
      quote ? `選んだ文: 「${quote}」` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Escape で畳む（入力中でも閉じ、書きかけの文は残す）。drawer が開いていれば drawer を閉じる
  const close = React.useCallback(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (drawer) setDrawer(false)
    else setOpen(false)
  }, [drawer])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (drawer || open)) {
        // 表とグラフの全体表示（popover）は、その Escape で先に閉じる
        if (document.querySelector(':popover-open')) return
        close()
        return
      }
      const t = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      show()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, open, drawer, close])

  // 拡張機能（Vimium など）は入力欄の Escape を先に受け取り、focus を外すだけで頁へ渡さない。
  // キーも押さず指も触れずに入力欄から focus が抜けたら、Escape と見なして1回で畳む
  const lastInput = React.useRef(0)
  React.useEffect(() => {
    const mark = () => (lastInput.current = performance.now())
    window.addEventListener('pointerdown', mark, true)
    window.addEventListener('keydown', mark, true)
    return () => {
      window.removeEventListener('pointerdown', mark, true)
      window.removeEventListener('keydown', mark, true)
    }
  }, [])
  const onDockBlur = (e: React.FocusEvent) => {
    if (e.relatedTarget || !matchMedia('(pointer: fine)').matches) return
    if (performance.now() - lastInput.current < 50) return
    requestAnimationFrame(() => {
      if (document.hasFocus() && document.visibilityState === 'visible' && !dock.current?.contains(document.activeElement)) setOpen(false)
    })
  }

  // スマホの drawer を開いている間は、下の頁を動かさない。広い画面の side panel では頁を左へ寄せ、読み続けられるようにする
  React.useEffect(() => {
    if (!drawer) return
    const body = document.body.style
    const saved = { overflow: body.overflow, marginRight: body.marginRight }
    const apply = () => {
      const wide = matchMedia(WIDE_QUERY).matches
      body.overflow = wide ? saved.overflow : 'hidden'
      body.marginRight = wide ? `${SIDE_WIDTH}px` : saved.marginRight
      // 固定の小さなヘッダーも panel の左で終える
      document.documentElement.style.setProperty('--side-panel', wide ? `${SIDE_WIDTH}px` : '0px')
    }
    apply()
    const media = matchMedia(WIDE_QUERY)
    media.addEventListener('change', apply)
    return () => {
      media.removeEventListener('change', apply)
      body.overflow = saved.overflow
      body.marginRight = saved.marginRight
      document.documentElement.style.removeProperty('--side-panel')
    }
  }, [drawer])

  // 取っ手を下へ引いて閉じる
  const drag = React.useRef<{ y: number; dy: number }>(undefined)
  const [dragY, setDragY] = React.useState(0)
  const onHandleDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    drag.current.dy = Math.max(0, e.clientY - drag.current.y)
    setDragY(drag.current.dy)
  }
  const onHandleUp = () => {
    if (drag.current && drag.current.dy > DRAWER_DRAG_CLOSE) setDrawer(false)
    drag.current = undefined
    setDragY(0)
  }

  const start = (id: string, session: StoredSession) => {
    setChat({ id, session })
    setDrawer(true)
    setOpen(false)
    setQuote('')
  }
  const restart = () => {
    setChat(undefined)
    setDrawer(false)
    anchor.current = window.scrollY
    setOpen(true)
    requestAnimationFrame(() => dock.current?.querySelector<HTMLElement>('textarea, input')?.focus())
  }

  const header = chat ? (
    <div
      className="flex touch-none cursor-grab flex-col items-center px-4 pb-2 pt-2 active:cursor-grabbing md:cursor-auto md:touch-auto md:pt-3"
      onPointerDown={onHandleDown}
      onPointerMove={onHandleMove}
      onPointerUp={onHandleUp}
      onPointerCancel={onHandleUp}
    >
      <span aria-hidden="true" className="mb-2 h-1.5 w-10 rounded-full bg-border md:hidden" />
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <span className="text-sm text-muted-foreground">{name}について</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <a href={`/s/${chat.id}`} aria-label="会話を別の頁で開く" title="会話を別の頁で開く" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><ArrowUpRightIcon className="size-4" /></a>
          <button type="button" onClick={restart} aria-label="新しい会話" title="新しい会話" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><NotePencilIcon className="size-4" /></button>
          <button type="button" onClick={() => setDrawer(false)} aria-label="閉じる" title="閉じる（Esc）" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><XIcon className="size-4" /></button>
        </div>
      </div>
    </div>
  ) : null

  const chip = quote ? (
    <div className="mb-2 flex min-w-0 items-center gap-2 self-start rounded-full border bg-background py-1 pl-3 pr-1 text-[12.5px] text-muted-foreground shadow-sm">
      <QuotesIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate"><span className="sr-only">選んだ文: </span>{quote}</span>
      <button type="button" onClick={() => setQuote('')} aria-label="選んだ文を外す" className="shrink-0 rounded-full p-1 hover:bg-secondary hover:text-foreground"><XIcon className="size-3" /></button>
    </div>
  ) : null

  const docked = open && !chat
  return (
    <>
      <div ref={dock} onBlur={onDockBlur} onFocus={() => { focusedAt.current = Date.now(); anchor.current = window.scrollY }} className={`fixed inset-x-0 bottom-0 z-20 max-md:bottom-(--bottom-nav) md:left-(--nav-w) md:right-(--side-panel,0px) bg-gradient-to-t from-background from-60% to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${docked ? '' : 'pointer-events-none translate-y-4 opacity-0'}`} inert={!docked}>
        <div className="mx-auto max-w-[720px]">
          <StartForm sitekey={sitekey} placeholder={`${name}について聞く…`} context={describe} onStart={start} before={chip} />
        </div>
      </div>
      <button
        type="button"
        onClick={show}
        aria-keyshortcuts="/"
        className={`fixed bottom-[max(16px,env(safe-area-inset-bottom))] max-md:bottom-[calc(16px+var(--bottom-nav))] right-4 z-20 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm shadow-md transition-[opacity,transform] duration-200 hover:border-primary motion-reduce:transition-none ${docked || drawer ? 'pointer-events-none translate-y-4 opacity-0' : ''}`}
        tabIndex={docked || drawer ? -1 : 0}
        aria-hidden={docked || drawer}
      >
        <ChatCircleIcon className="size-4 text-primary" aria-hidden="true" />
        {chat ? '会話に戻る' : `${name}について聞く`}
      </button>
      {chat ? (
        <>
          <div aria-hidden="true" onClick={() => setDrawer(false)} className={`fixed inset-0 z-30 bg-foreground/20 md:hidden transition-opacity duration-300 motion-reduce:transition-none ${drawer ? '' : 'pointer-events-none opacity-0'}`} />
          <div
            ref={sheet}
            role="dialog"
            aria-label={`${name}についての会話`}
            inert={!drawer}
            style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
            className={`fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[88dvh] max-w-4xl flex-col overflow-hidden rounded-t-[24px] border border-b-0 bg-background shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none md:inset-x-auto md:right-0 md:top-0 md:h-auto md:w-[440px] md:max-w-none md:rounded-none md:border-y-0 md:border-r-0 md:shadow-xl ${drawer ? '' : 'translate-y-[calc(100%+48px)] md:translate-x-[calc(100%+48px)] md:translate-y-0'}`}
          >
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <React.Suspense fallback={<p className="p-6 text-sm text-muted-foreground">会話を開いています…</p>}>
                <Conversation key={chat.id} id={chat.id} stored={chat.session} header={header} scroller={scroller} context={describe} beforeComposer={chip} onSend={() => setQuote('')} />
              </React.Suspense>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
