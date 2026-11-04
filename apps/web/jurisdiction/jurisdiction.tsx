// 自治体の個別ページ（/:都道府県/:名称）の島。サーバーが書いた HTML（検索エンジン向け）を、同じデータで描き直す。
// 型は企業のプロフィールページ: ヘッダー（ロゴ・名前・一文・属性）＋年度のタブ＋左の目次＋見出し付きの節。年度を切り替えるとページ全体がその年度になる。
// 歳出の決算は API の値。方針・政策領域・事業の入れ替えは jurisdiction/profiles.ts の手で起こした値で、ある自治体・年度だけ節を出す
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRightIcon, GlobeIcon, MapPinIcon, UsersIcon } from 'lucide-react'
import { StartForm } from '../chat/start-form'
import { Flow } from './flow'
import { assetPath, type Domain, type PolicyProject, type Profile, type ProfileYear, type ProjectStatus, type Scrap } from './profiles'
import { changePct, formatYen, INDEX_PATH, reiwa, type PageData, type Project, type Setsu, type YearTotal } from './types'

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

const Section = ({ id, title, link, children }: { id: string; title: string; link?: { href: string; label: string }; children: React.ReactNode }) => (
  <section id={id} aria-labelledby={`h-${id}`} className="flex scroll-mt-32 md:scroll-mt-20 flex-col gap-4">
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={`h-${id}`} className="font-sans text-[26px] font-normal leading-snug">
        {title}
      </h2>
      {link ? (
        <a href={link.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] text-primary no-underline hover:underline">
          {link.label}
          <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
        </a>
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

function Domains({ code, domains }: { code: string; domains: Domain[] }) {
  return (
    <Section id="domains" title="政策領域">
      {domains.map((d) => (
        <div key={d.id} id={`d-${d.id}`} className="flex scroll-mt-32 md:scroll-mt-20 flex-col gap-1 [&+&]:mt-12">
          <h3 className="mb-3.5 border-l-4 border-primary py-0.5 pl-3.5 text-[19px] leading-snug sm:text-[22px]">{d.name}</h3>
          <img src={assetPath(code, d.image)} alt="" loading="lazy" className="mb-3 aspect-[16/7] w-full rounded-lg object-cover sm:aspect-[4/1]" />
          <div className="border-t border-foreground">
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
function Budget({ data, year }: { data: PageData; year: number }) {
  const total = data.years.find((y) => y.year === year)
  const prev = data.years.find((y) => y.year === year - 1)
  const isLatest = !!total && total.year === data.years.at(-1)?.year
  const pct = total ? changePct(total.yen, prev?.yen) : null
  const max = data.projects[0]?.yen ?? 1
  return (
    <Section id="budget" title="予算と決算">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <span className="text-sm text-muted-foreground">歳出（決算）</span>
        <b className={`text-[clamp(2rem,1.5rem+1.8vw,2.8rem)] font-normal leading-tight tabular-nums ${total ? '' : 'text-muted-foreground'}`}>{total ? formatYen(total.yen) : '—'}</b>
        {pct !== null ? <span className={`text-[13px] tabular-nums ${pct < 0 ? 'text-[#aa5910]' : 'text-primary'}`}>前年度比 {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span> : null}
      </div>
      {total ? <Flow key={year} data={data} total={total} /> : <Empty>{reiwa(year)}の決算は、まだ収録していません</Empty>}
      <h3 className="mt-4 text-lg">金額の大きい事業</h3>
      {isLatest ? (
        <ul className="border-t">
          {data.projects.map((p, i) => (
            <ProjectRow key={p.id} p={p} rank={i + 1} max={max} />
          ))}
        </ul>
      ) : (
        <Empty>{total ? `${reiwa(year)}の事業の一覧は、まだ出していません` : `${reiwa(year)}の決算は、まだ収録していません`}</Empty>
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

function YearPicker({ years, current, onChange }: { years: number[]; current: number; onChange: (y: number) => void }) {
  return (
    <div role="group" aria-label="年度" className="flex gap-1">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          aria-pressed={y === current}
          onClick={() => onChange(y)}
          className={`rounded-full px-2.5 py-1.5 text-[13px] ${y === current ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {reiwa(y)}
        </button>
      ))}
    </div>
  )
}

const yearFromHash = () => Number(/^#y(\d{4})$/.exec(location.hash)?.[1]) || undefined

function Page({ data, sitekey }: { data: PageData; sitekey: string }) {
  const profile = data.profile ?? null
  const years = React.useMemo(() => [...new Set([...Object.keys(profile?.years ?? {}).map(Number), ...data.years.map((y) => y.year)])].sort((a, b) => b - a), [data, profile])
  const [year, setYear] = React.useState(() => {
    const y = yearFromHash()
    return y && years.includes(y) ? y : years[0]!
  })
  const py = profile?.years[String(year)]
  const choose = (y: number) => {
    setYear(y)
    history.replaceState(null, '', `#y${y}`)
  }

  const toc: TocItem[] = [
    ...(py ? [{ href: '#policy', label: '方針' }, { href: '#domains', label: '政策領域' }, ...py.domains.map((d) => ({ href: `#d-${d.id}`, label: d.short ?? d.name, sub: true }))] : []),
    { href: '#budget', label: '予算と決算' },
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
      <div className={`fixed inset-x-0 top-0 z-30 border-b bg-background transition-transform duration-200 ease-out motion-reduce:transition-none ${mini ? '' : '-translate-y-full'}`} aria-hidden={!mini} inert={!mini}>
        <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-3 px-4">
          <span className="hidden size-10 shrink-0 place-items-center rounded-lg border bg-white p-1 sm:grid">{logo ? <img src={logo} alt="" className="w-full" /> : <span className="text-foreground">{data.name[0]}</span>}</span>
          <b className="shrink-0 text-lg font-normal">{data.name}</b>
          {tagline ? <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:block">{tagline}</span> : null}
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
            <h1 ref={title} className="text-[clamp(2rem,1.5rem+2vw,2.8rem)] font-normal leading-tight">{data.name}</h1>
            {tagline ? <p className="text-[17px] [text-wrap:pretty] [word-break:auto-phrase]">{tagline}</p> : null}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon className="size-4" aria-hidden="true" />
                <a href={`${INDEX_PATH}#${encodeURIComponent(data.prefecture)}`} className="text-primary no-underline">{data.prefecture}</a>
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
                  <a href={profile.site} className="text-primary no-underline">{new URL(profile.site).host.replace(/^www\./, '')}</a>
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
            {py ? <Domains code={data.code} domains={py.domains} /> : null}
            <Budget data={data} year={year} />
            {py?.scrap ? <ScrapSection scrap={py.scrap} /> : null}
          </main>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background from-60% to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[720px]">
          <StartForm
            sitekey={sitekey}
            prefix={`${data.name}について：`}
            placeholder={`${data.name}について聞く…`}
          />
        </div>
      </div>
    </>
  )
}

const root = document.getElementById('j-app')
const raw = document.getElementById('j-data')?.textContent
if (root && raw) createRoot(root).render(<Page data={JSON.parse(raw) as PageData} sitekey={root.dataset.turnstileSitekey ?? ''} />)
