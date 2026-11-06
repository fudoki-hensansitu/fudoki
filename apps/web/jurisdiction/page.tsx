// 自治体の個別ページ（/:都道府県/:名称）の島。サーバーが書いた HTML（検索エンジン向け）を、同じデータで描き直す。
// 型は企業のプロフィールページ: ヘッダー（ロゴ・名前・一文・属性）＋年度のタブ＋左の目次＋見出し付きの節。年度を切り替えるとページ全体がその年度になる。
// 歳出の決算は API の値。新しく始めたこと・やめたこと（事業の入れ替え）は jurisdiction/profiles.ts の手で起こした値で、ある自治体・年度だけ節を出す
import { Link } from '@void/react'
import * as React from 'react'
import { ArrowLeftIcon, ArrowRightIcon, ArrowSquareOutIcon, CaretRightIcon, MapPinAreaIcon, MapTrifoldIcon, SquaresFourIcon, BankIcon, BasketballIcon, CaretDownIcon, CheckCircleIcon, CircleHalfIcon, ClipboardTextIcon, ClockIcon, CoinsIcon, ChatCircleIcon, FirstAidKitIcon, GlobeIcon, HandHeartIcon, HouseLineIcon, LeafIcon, MapPinIcon, MinusCircleIcon, NotePencilIcon, QuotesIcon, ShieldCheckIcon, StorefrontIcon, StudentIcon, DotsThreeCircleIcon, UsersIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { StartForm } from '../chat/start-form'
import type { StoredSession } from '../chat/store'
import { Hint } from '@/components/hint'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DOMAIN_FRAMES, groupByFrame, OTHER_FRAME } from './domains'
import { Flow } from './flow'
import { assetPath, type PolicyProject, type ProfileYear, type ProjectStatus, type Scrap } from './profiles'
import { changePct, INDEX_PATH, formatAsOf, formatPeople, formatYen, reiwa, yearName, type FlowView, type PageData, type Project, type Setsu, type YearTotal } from './types'

const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

/** 区の評価から読める結果。unmeasured は、評価の指標がこの取り組みではなく同じ事業の別の内容を測っているもの */
const BADGE: Record<ProjectStatus, { label: string; className: string; icon: typeof ClockIcon }> = {
  short: { label: '目標に届いていない', className: 'bg-[color-mix(in_srgb,var(--kincha)_22%,transparent)] text-[color-mix(in_srgb,var(--kincha-ink),var(--foreground)_15%)]', icon: WarningCircleIcon },
  met: { label: '目標に届いた', className: 'bg-primary/15 text-primary', icon: CheckCircleIcon },
  mixed: { label: '達成と未達が混在', className: 'bg-secondary text-muted-foreground', icon: CircleHalfIcon },
  unmeasured: { label: '評価は別の内容', className: 'bg-secondary text-muted-foreground', icon: MinusCircleIcon },
  none: { label: '評価前', className: 'border border-dashed text-muted-foreground', icon: ClockIcon },
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const { label, className, icon: Icon } = BADGE[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-xs leading-5 ${className}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  )
}

/** aside は見出しの横に並べる短い値（決算の総額など） */
type SectionLink = { href: string; label: string }
/** link は見出しの右に出す出典（PDF を直接開く）。複数あれば並べる */
/** lead は見出しの下の一文。区政を知らない人にその節で何が分かるかを言う */
const Section = ({ id, title, lead, aside, link, children }: { id: string; title: string; lead?: string; aside?: React.ReactNode; link?: SectionLink | SectionLink[]; children: React.ReactNode }) => (
  <section id={id} aria-labelledby={`h-${id}`} className="flex scroll-mt-32 lg:scroll-mt-20 flex-col gap-4">
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
            <Button key={l.href} variant="link" size="inline" nativeButton={false} render={<a href={l.href} target="_blank" rel="noopener" />} className="text-[13px]">
              {l.label}
              <ArrowSquareOutIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
    {lead ? <p className="-mt-2 text-sm text-muted-foreground [text-wrap:pretty]">{lead}</p> : null}
    {children}
  </section>
)

/** 区の評価の区分（A〜D）を丸で囲んだ印。良し悪しの色は付けない */
function GradeMark({ grade }: { grade: string }) {
  return <span aria-hidden="true" className="inline-grid size-5 shrink-0 place-items-center rounded-full border border-current text-[11px] leading-none">{grade}</span>
}

/** 「C やり方を見直す」を印と言葉に分ける */
function Grade({ grade, className }: { grade: string; className?: string }) {
  const m = /^([A-D])\s*(.*)$/.exec(grade)
  if (!m) return <span className={className}>{grade}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <GradeMark grade={m[1]!} />
      <span><span className="sr-only">{m[1]} </span>{m[2]}</span>
    </span>
  )
}

/** 予算書の金額のラベル。取り組みだけの金額が載っていないときは「〇〇全体」で、取り組みを含む事業の金額を出している */
const amountLabel = (label?: string) => {
  const whole = label?.match(/^(.+)全体$/)?.[1]
  return whole ? <>{whole}の予算<span className="block">この取り組みを含む</span></> : label
}

function ProjectItem({ p }: { p: PolicyProject }) {
  const note = p.evaluation?.note.replace(/^（[^）]+）/, '')
  // unmeasured は評価の指標が取り組みではなく事業の別の内容を測っているので、結果の印を付けない（どの事業かは金額のラベルで言う）
  const badge = p.status && p.status !== 'unmeasured' ? p.status : undefined
  return (
    // 1列で上から読む。金額は名前と同じ行の右に置き、評価の枠は幅いっぱいに出す
    <div className="flex flex-col gap-2 border-b border-foreground/10 py-4">
      <div className="flex items-start justify-between gap-x-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[15.5px]">
          {p.name}
          {badge ? <StatusBadge status={badge} /> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1 text-right text-sm">
          {p.amounts.map((a) => (
            <span key={`${a.yen}-${a.label ?? ''}`} className="tabular-nums">
              {formatYen(a.yen)}
              {a.label ? <small className="block text-xs leading-snug text-muted-foreground">{amountLabel(a.label)}</small> : null}
            </span>
          ))}
        </div>
      </div>
      <p className="text-sm">{p.what}</p>
      {p.evaluation ? (
        // 評価の区分と説明は一続きの文として、同じ大きさ・色で読ませる
        <p className="rounded-xl bg-sidebar px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground [text-wrap:pretty]">
          <span className="mr-2 inline-flex items-center gap-1 align-middle">
            <ClipboardTextIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            評価
          </span>
          {/* 区分がまだ無い（評価が公表される前）ときも枠は出し、空のまま見せる。理由は説明の文で言う */}
          {p.evaluation.grade ? <Grade grade={p.evaluation.grade} className="align-middle" /> : <span className="inline-flex items-center gap-1.5 align-middle text-muted-foreground"><GradeMark grade="–" />未公表</span>}
          {note ? '。' : null}
          {note}
        </p>
      ) : null}
    </div>
  )
}

/** 分野（domains.ts）の id ごとの icon */
const DOMAIN_ICON: Record<string, typeof BankIcon> = {
  bosai: ShieldCheckIcon, fukushi: HandHeartIcon, kyoiku: StudentIcon, iryo: FirstAidKitIcon, kurashi: HouseLineIcon,
  sangyo: StorefrontIcon, kankyo: LeafIcon, bunka: BasketballIcon, gyosei: BankIcon, other: DotsThreeCircleIcon,
}

/** 区政を知らない人の入口。自治体の仕事を分野の例で見せ、1年に使うお金を住民1人あたりで言う（最新の決算） */
function Overview({ data, sections }: { data: PageData; sections: Set<string> }) {
  const latest = data.years.at(-1)
  const people = data.population?.people
  const kind = data.name.slice(-1)
  return (
    <Section id="about" title={`${kind}は何をしている？`}>
      {latest ? (
        <p className="text-[15px]">
          {reiwa(latest.year)}に使ったお金は<b className="mx-1 text-xl font-normal tabular-nums text-[var(--kincha-ink)]">{formatYen(latest.yen)}</b>
          {people ? (
            <>
              、住民1人あたり<b className="mx-1 text-xl font-normal tabular-nums text-[var(--kincha-ink)]">約{Math.round(latest.yen / people / 1e4).toLocaleString('ja-JP')}万円</b>
            </>
          ) : null}
          です。
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-x-8 border-t sm:grid-cols-2">
        {[...DOMAIN_FRAMES.filter((f) => f.examples), OTHER_FRAME].map((f) => {
          // 最新の決算を COFOG の大分類で分けた額（お金の流れの機能分類と同じ値）
          const spent = data.cofogFlow.find((d) => d.kan.id === `cofog-${f.cofog || 'none'}`)?.kan
          if (f === OTHER_FRAME && !spent) return null
          return (
            <li key={f.id} className="border-b border-foreground/10">
              <DomainLink section={sections.has(f.id) ? `d-${f.id}` : undefined}>
              <DomainIcon id={f.id} />
              <div className="min-w-0 flex-1">
                <b className="block text-[15px] font-normal">{f.name}</b>
                <span className="block text-[13px] leading-snug text-muted-foreground">{f.examples}</span>
              </div>
              <div className="text-right tabular-nums">
                <span className={`block text-[15px] ${spent ? '' : 'text-muted-foreground'}`}>{spent ? (spent.amountMissing ? '金額未記載' : formatYen(spent.yen)) : '—'}</span>
                {spent && !spent.amountMissing && people ? <span className="block text-xs text-muted-foreground">1人 約{Math.round(spent.yen / people / 1e3) / 10}万円</span> : null}
              </div>
              </DomainLink>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** 分野の行。その年度の「暮らしで何が変わった？」にその分野があれば、そこへ移るリンクにする */
function DomainLink({ section, children }: { section?: string; children: React.ReactNode }) {
  // アイコン・名前・金額の3列を全行で同じ幅にし、行は隣の列の行と同じ高さいっぱいに広げて中央に揃える
  const row = 'grid h-full grid-cols-[1.75rem_minmax(0,1fr)_5.5rem] items-center gap-3 py-3'
  if (!section) return <div className={row}>{children}</div>
  return (
    <a
      href={`#${section}`}
      // 目次と同じく #yYYYY を節の fragment に置き換えない
      onClick={(e) => { const t = document.getElementById(section); if (!t) return; e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }) }}
      className={`${row} text-foreground no-underline transition-colors hover:bg-card`}
    >
      {children}
    </a>
  )
}

function Domains({ year }: { year: ProfileYear }) {
  return (
    <Section id="domains" title="暮らしで何が変わった？" lead="この年度に新しく始めた・広げた取り組みと、それを自治体が自分で評価した結果です。" link={[{ href: year.budgetSource, label: '当初予算' }, { href: year.evaluationSource, label: '事業評価' }]}>
      {groupByFrame(year.projects).map(({ frame: d, items }) => (
        <div key={d.id} id={`d-${d.id}`} className="flex scroll-mt-32 lg:scroll-mt-20 flex-col gap-1 [&+&]:mt-12">
          <h3 className="mb-1.5 flex items-center gap-2.5 text-[19px] leading-snug sm:text-[22px]">
            <DomainIcon id={d.id} />
            {d.name}
          </h3>
          <div className="border-t">
            {items.map((p) => <ProjectItem key={p.name} p={p} />)}
          </div>
        </div>
      ))}
    </Section>
  )
}

/** 最後の節の行き先のカード。icon の箱（紋章があれば紋章）と名前 */
function PlaceCard({ href, name, logo, icon: Icon, className }: { href: string; name: string; logo?: string; icon: typeof MapPinAreaIcon; className?: string }) {
  return (
    <li className={className}>
      <Link href={href} className="group flex items-center gap-3.5 rounded-2xl border bg-background p-3.5 text-foreground no-underline transition-colors hover:border-primary/40 hover:bg-card">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-white p-1.5">
          {logo ? <img src={logo} alt="" className="h-auto w-full" /> : <Icon aria-hidden="true" className="size-6 text-primary" />}
        </span>
        <b className="min-w-0 flex-1 truncate text-[16px] font-normal">{name}</b>
        <CaretRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

/** 最後の節。都道府県・近くの自治体（紋章があれば紋章）・全国の一覧を同じカードで並べる */
function Elsewhere({ data }: { data: PageData }) {
  return (
    <Section id="elsewhere" title="ほかの自治体も見る">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.prefecturePath !== INDEX_PATH ? <PlaceCard href={data.prefecturePath} name={data.prefecture} icon={MapTrifoldIcon} /> : null}
        {data.neighbors.map((n) => <PlaceCard key={n.path} href={n.path} name={n.name} logo={n.logo} icon={MapPinAreaIcon} />)}
        <PlaceCard href={INDEX_PATH} name="すべての自治体" icon={SquaresFourIcon} className="sm:col-span-2" />
      </ul>
    </Section>
  )
}

function DomainIcon({ id }: { id: string }) {
  const Icon = DOMAIN_ICON[id]
  if (!Icon) return <span aria-hidden="true" className="h-6 w-1 rounded-full bg-primary" />
  return (
    <Icon aria-hidden="true" className="size-6 shrink-0 text-primary sm:size-7" />
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
          <span className="text-xs text-muted-foreground">{p.domain}</span>
        </div>
        <div className="order-5 col-span-full sm:order-none sm:col-span-1">
          <div className="h-2.5 overflow-hidden rounded-full bg-foreground/5">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(p.yen / max) * 100}%` }} />
          </div>
        </div>
        <div className="text-right text-[15px] tabular-nums">{p.amountMissing ? '金額未記載' : formatYen(p.yen)}</div>
        <div className={`hidden text-right text-[15px] tabular-nums sm:block text-foreground`}>
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
/** お金の流れの分け方。既定は機能分類（目的で分ける COFOG を domains.ts の枠にまとめたもの）で、どの自治体も同じ枠で比べられる。自治体分類は予算書・決算書の款・項のまま */
const VIEWS: { key: FlowView; label: string }[] = [
  { key: 'cofog', label: '機能分類' },
  { key: 'kan', label: '自治体分類' },
]

/** 予算の節。決算と予算をタブで切り替える。予算はまだ取り込んでいないので、どの年度も空の枠を出す */
function Budget({ data, year }: { data: PageData; year: number }) {
  const [phase, setPhase] = React.useState<Phase>('settlement')
  const [view, setView] = React.useState<FlowView>('cofog')
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
      {pct !== null ? <span className={`text-[13px] tabular-nums text-muted-foreground`}>前年度比 {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span> : null}
    </>
  )
  // 決算・予算のタブは左、分類のメニューは右に置く
  const tabs = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
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
    {/* 決算・予算のタブとは別の形（select）にし、金額の段階の切り替えと分け方の切り替えを見分けられるようにする */}
    <Select items={VIEWS.map((v) => ({ value: v.key, label: v.label }))} value={view} onValueChange={(v) => v && setView(v as FlowView)}>
      <SelectTrigger size="sm" aria-label={`分類：${VIEWS.find((v) => v.key === view)!.label}`} className="text-[13px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {VIEWS.map((v) => <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>)}
      </SelectContent>
    </Select>
    </div>
  )
  return (
    <Section
      id="budget"
      title="お金は何に使われた？"
      lead="機能分類は、使い道を目的ごとに分ける世界共通の分類（COFOG）です。自治体分類は、予算書・決算書の分け方そのままです。"
      link={docs.length ? docs : undefined}
    >
      <div id="budget-panel" role="tabpanel" aria-labelledby={`tab-${phase}`} data-ask-view={`${reiwa(year)}の${label}の金額（${VIEWS.find((v) => v.key === view)!.label}）`} className="flex flex-col gap-4">
        {total ? (
          <Flow key={`${year}-${view}`} data={data} total={total} view={view} tabs={tabs} summary={summary} />
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
    <Section id="projects" title="いちばんお金がかかっているのは？">
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
    <Section id="scrap" title="やめたこと・見直したことは？" lead="自治体は毎年、事業を自分で評価して、やめたり減らしたりして浮いたお金を新しいことに回しています。">
      <div className="flex max-w-[560px] flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span>やめたり減らしたりして浮かせたお金</span>
          <b className="text-[28px] font-normal tabular-nums text-primary">
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
      <h3 className="text-lg">自治体が自分で付けた評価（{scrap.evaluated.toLocaleString('ja-JP')}事業）</h3>
      <div className="grid grid-cols-2 border-t sm:grid-cols-4">
        {grades.map(([g, label]) => (
          <div key={g} className="flex flex-col py-3">
            <b className="text-2xl font-normal leading-snug tabular-nums">{scrap.grades[g]}</b>
            <Grade grade={`${g} ${label}`} className="text-[13px] text-muted-foreground" />
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
        <Hint key={y} label={reiwa(y)}>
          <button type="button" aria-pressed={y === current} onClick={() => onChange(y)} className={pill(y === current)}>
            {yearName(y)}
            {yearName(y) !== reiwa(y) ? <span className="hidden text-muted-foreground lg:inline">（{reiwa(y).replace(/年度$/, '')}）</span> : null}
          </button>
        </Hint>
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
  // 基本構想の都市像。年度で変わらない
  const vision = profile?.vision?.text
  const choose = (y: number) => {
    setYear(y)
    history.replaceState(null, '', `#y${y}`)
  }

  const money: TocItem[] = [
    { href: '#budget', label: 'お金の使い道' },
    { href: '#projects', label: '大きな支出' },
  ]
  // 区政を知らない人には金額より暮らしの具体例が先。変わったことから入り、お金の内訳へ進む
  const fresh: TocItem[] = py ? [{ href: '#domains', label: '暮らしで変わったこと' }, ...groupByFrame(py.projects).map(({ frame: d }) => ({ href: `#d-${d.id}`, label: d.name, sub: true }))] : []
  const toc: TocItem[] = [
    { href: '#about', label: `${data.name.slice(-1)}の仕事` },
    ...fresh,
    ...money,
    ...(py?.scrap ? [{ href: '#scrap', label: 'やめたこと' }] : []),
    { href: '#elsewhere', label: 'ほかの自治体' },
  ]

  // スクロールしたら小さなヘッダーを出す
  const title = React.useRef<HTMLHeadingElement>(null)
  const headerRef = React.useRef<HTMLElement>(null)
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const [mini, setMini] = React.useState(false)
  const [headerWide, setHeaderWide] = React.useState(true)
  React.useEffect(() => {
    const el = title.current
    if (!el) return
    const observer = new IntersectionObserver(([e]) => setMini(!e!.isIntersecting && e!.boundingClientRect.top < 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    const el = headerRef.current
    const name = title.current
    const picker = pickerRef.current
    if (!el || !name || !picker) return
    // 名前の文字の右端と年度選択の幅を実測し、右上に重ねずに置けるときだけ絶対配置にする（名前の長さ・会話パネルで幅が変わる）
    const range = document.createRange()
    const update = () => {
      range.selectNodeContents(name)
      const textRight = range.getBoundingClientRect().right - el.getBoundingClientRect().left
      setHeaderWide(textRight + 24 + picker.getBoundingClientRect().width <= el.getBoundingClientRect().width)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    ro.observe(picker)
    return () => ro.disconnect()
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

  const logo = profile?.logo ? assetPath(data.code, profile.logo) : null

  return (
    <>
      <div className={`fixed left-0 right-(--side-panel,0px) top-0 z-30 md:left-(--nav-w) border-b bg-background transition-[transform,right] duration-200 ease-out motion-reduce:transition-none ${mini ? '' : '-translate-y-full'}`} aria-hidden={!mini} inert={!mini}>
        <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-3 px-4">
          <span className="hidden size-10 shrink-0 place-items-center rounded-lg border bg-white p-1 sm:grid">{logo ? <img src={logo} alt="" className="w-full" /> : <span className="text-foreground">{data.name[0]}</span>}</span>
          <b className="shrink-0 text-lg font-normal">{data.name}</b>
          {vision ? <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:block">{vision}</span> : null}
          {years.length > 1 ? (
            <div className="ml-auto shrink-0">
              <YearPicker years={years} current={year} onChange={choose} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-4 pb-48">
        <header ref={headerRef} className="relative grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 border-b py-7 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-7">
          {years.length > 1 ? (
            <div ref={pickerRef} className={headerWide ? 'col-span-full -mb-2 justify-self-end sm:absolute sm:right-0 sm:top-7 sm:mb-0' : 'col-span-full -mb-2 justify-self-end'}>
              <YearPicker years={years} current={year} onChange={choose} />
            </div>
          ) : null}
          <div className="grid size-20 place-items-center rounded-xl border bg-white p-2.5 sm:size-[132px] sm:rounded-2xl sm:p-[18px]">
            {logo ? <img src={logo} alt={data.name} className="h-auto w-full" /> : <span className="text-3xl text-foreground sm:text-5xl">{data.name[0]}</span>}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h1 ref={title} className="text-[clamp(1.75rem,1.4rem+1.2vw,2.25rem)] font-normal leading-tight">{data.name}</h1>
            {vision ? <p className="text-[17px] [text-wrap:pretty] [word-break:auto-phrase]">{vision}</p> : null}
            <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 whitespace-nowrap text-xs text-muted-foreground sm:gap-x-6 sm:text-sm">
              <span className="inline-flex items-center gap-1 sm:gap-1.5">
                <MapPinIcon className="size-3.5 sm:size-4" aria-hidden="true" />
                <Button variant="link" size="inline" nativeButton={false} render={<Link href={data.prefecturePath} />}>{data.prefecture}</Button>
              </span>
              {data.population ? (
                <Hint label={`住民基本台帳人口（${formatAsOf(data.population.asOf)}時点）`}>
                  <span className="inline-flex items-center gap-1 text-foreground sm:gap-1.5">
                    <UsersIcon className="size-3.5 text-muted-foreground sm:size-4" aria-hidden="true" />
                    <span className="sr-only">人口 </span>
                    {formatPeople(data.population.people)}
                  </span>
                </Hint>
              ) : null}
              {data.officialUrl ? (
                <span className="inline-flex items-center gap-1 sm:gap-1.5">
                  <GlobeIcon className="size-3.5 sm:size-4" aria-hidden="true" />
                  <Button variant="link" size="inline" nativeButton={false} render={<a href={data.officialUrl} target="_blank" rel="noopener" />}>公式サイト</Button>
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

        <nav ref={spBar} aria-label="目次" className={`sticky z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b bg-background px-4 py-2.5 [scrollbar-width:none] lg:hidden ${mini ? 'top-[61px]' : 'top-0'}`}>
          {toc.filter((t) => !t.sub).map((t) => (
            <a key={t.href} href={t.href} onClick={jump} data-current={isCurrent(t.href) || undefined} className="shrink-0 rounded-full border px-3 py-1 text-[13px] text-muted-foreground no-underline data-[current]:border-primary data-[current]:bg-primary data-[current]:text-primary-foreground">
              {t.label}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-12 pt-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:pt-8">
          <nav aria-label="目次" className="sticky top-[84px] hidden flex-col gap-0.5 self-start lg:flex">
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
            <Overview data={data} sections={new Set(py ? groupByFrame(py.projects).map(({ frame }) => frame.id) : [])} />
            {py ? <Domains year={py} /> : null}
            <Budget data={data} year={year} />
            <Projects data={data} year={year} />
            {py?.scrap ? <ScrapSection scrap={py.scrap} /> : null}
            <Elsewhere data={data} />
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
          <Hint label="会話を別の頁で開く"><Link href={`/s/${chat.id}`} aria-label="会話を別の頁で開く" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><ArrowSquareOutIcon className="size-4" /></Link></Hint>
          <Hint label="新しい会話"><button type="button" onClick={restart} aria-label="新しい会話" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><NotePencilIcon className="size-4" /></button></Hint>
          <Hint label="閉じる（Esc）"><button type="button" onClick={() => setDrawer(false)} aria-label="閉じる" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><XIcon className="size-4" /></button></Hint>
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
