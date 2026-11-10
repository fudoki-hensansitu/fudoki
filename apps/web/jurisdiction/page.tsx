// 自治体の個別ページ（/:都道府県/:名称）の島。サーバーが書いた HTML（検索エンジン向け）を、同じデータで描き直す。
// 型は企業のプロフィールページ: ヘッダー（ロゴ・名前・一文・属性）＋年度のタブ＋左の目次＋見出し付きの節。年度を切り替えるとページ全体がその年度になる。
// 歳出の決算は API の値。事業評価から取った事業・やめたこと（事業の入れ替え）は jurisdiction/profiles.ts の手で起こした値で、ある自治体・年度だけ節を出す
import { Link } from '@void/react'
import * as React from 'react'
import { ArrowLeftIcon, ArrowUpIcon, ArrowRightIcon, ArrowSquareOutIcon, CaretRightIcon, MapPinAreaIcon, MapTrifoldIcon, SquaresFourIcon, BankIcon, BasketballIcon, CaretDownIcon, CoinsIcon, RobotIcon, FirstAidKitIcon, GlobeIcon, HandHeartIcon, HouseLineIcon, LeafIcon, MapPinIcon, NotePencilIcon, QuotesIcon, ShieldCheckIcon, StorefrontIcon, StudentIcon, DotsThreeCircleIcon, UsersIcon, XIcon } from '@phosphor-icons/react'
import { StartForm } from '../chat/start-form'
import type { StoredSession } from '../chat/store'
import { rememberJurisdiction } from '../home/recent'
import { Hint } from '@/components/hint'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StopIcon, NewIcon, UpIcon, KeepIcon, LawIcon, PlanIcon, FixIcon, SizeIcon, CutIcon, DoneIcon, JoinIcon, MaybeStopIcon } from './fresh-icons'
import { DOMAIN_FRAMES, groupByFrame, OTHER_FRAME } from './domains'
import type { PressItem } from './budget-press'
import { EMBLEMS } from './emblems'
import { Flow } from './flow'
import { pageHead } from './html'
import { assetPath, type EvaluatedProject, type Initiative, type ProfileYear, type Scrap } from './profiles'
import { changePct, INDEX_PATH, formatAsOf, formatPeople, formatPerCapita, formatYen, pageYears, reiwa, yearName, yearPath, type FlowView, type PageData, type Project, type Setsu, type YearTotal } from './types'

const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

/** aside は見出しの横に並べる短い値（決算の総額など） */
type SectionLink = { href: string; label: string }
/** link は見出しの右に出す出典（PDF を直接開く）。複数あれば並べる */
/** lead は見出しの下の一文。区政を知らない人にその節で何が分かるかを言う */
const Section = ({ id, title, lead, aside, link, children }: { id: string; title: string; lead?: string; aside?: React.ReactNode; link?: SectionLink | SectionLink[]; children: React.ReactNode }) => (
  <section id={id} aria-labelledby={`h-${id}`} className="flex scroll-mt-32 @4xl:scroll-mt-20 flex-col gap-4">
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
  return <span aria-hidden="true" className="inline-grid size-5 shrink-0 place-items-center rounded-full border border-current align-middle text-[11px] leading-none">{grade}</span>
}

/** 「C 見直す」を印と言葉に分ける */
function Grade({ grade, className }: { grade: string; className?: string }) {
  const m = /^([A-D])\s*(.*)$/.exec(grade)
  if (!m) return <span className={className}>{grade}</span>
  return (
    // 区分の言葉は前後の文と同じ行の流れで折り返す（inline-flex だと言葉だけが箱になり、文と別物に見える）
    <span className={className}>
      <GradeMark grade={m[1]!} />
      <span className="ml-1.5"><span className="sr-only">{m[1]} </span>{m[2]}</span>
    </span>
  )
}

/** 金額の数字を大きく、単位（億円・万円）を小さく出す */
function YenText({ yen, className }: { yen: number; className?: string }) {
  const [, num, unit] = /^([\d,.]+)(.*)$/.exec(formatYen(yen)) ?? [, formatYen(yen), '']
  return (
    <span className={`tabular-nums ${className ?? ''}`}>
      <span className="text-xl">{num}</span>
      <span className="ml-0.5 text-xs">{unit}</span>
    </span>
  )
}

/** 新しく始めたことの形。事業評価のシートごと新しくできた事業か、今ある事業の中で始めた取り組みか、予算の資料で新規・レベルアップ（画面では拡大）と印の付いた項目か */
type Fresh = ({ kind: 'sheet' } & EvaluatedProject) | ({ kind: 'initiative' } & Initiative) | ({ kind: 'budget' } & PressItem)
const evaluatedOf = (y: ProfileYear): Fresh[] => [...y.projects.map((p) => ({ kind: 'sheet' as const, ...p })), ...[...(y.initiatives ?? [])].sort((a, b) => b.settledYen - a.settledYen).map((p) => ({ kind: 'initiative' as const, ...p }))]
/** 実績と評価のある事業評価を優先し、まだ公表されていない年度だけ予算の資料から出す */
const freshOf = (y: ProfileYear): Fresh[] => {
  const evaluated = evaluatedOf(y)
  return evaluated.length ? evaluated : [...(y.budgetNew ?? [])].sort((a, b) => b.budgetYen - a.budgetYen).map((p) => ({ kind: 'budget' as const, ...p }))
}


/** 予算の資料はその年度にこれから始める計画、事業評価は実施した結果なので、見出しの時制を分ける */
const isPlanned = (y: ProfileYear) => freshOf(y)[0]?.kind === 'budget'
const freshTitle = (y: ProfileYear) => (isPlanned(y) ? '新しく何を始める？' : '新しく何を始めた？')

/** 住民の数。新しく始めたことの金額の下に住民1人あたりの額を添えるのに使う（Domains の外から渡す） */
const PeopleContext = React.createContext<number | undefined>(undefined)

/** 新しく始めたことの1行。名前の左に新規か拡大・今ある事業の中での取り組みかの印、右に金額、下に中身。評価・予算どの年度も同じ形にする */
function FreshRow({ up, upLabel = '拡大', title, yen, source, children }: { up: boolean; upLabel?: string; title: string; yen: number; /** 名前の後ろに続けて置く、資料の該当ページへのリンク */ source?: { href: string; label: string }; children: React.ReactNode }) {
  const people = React.useContext(PeopleContext)
  const label = up ? upLabel : '新規'
  return (
    <div className="flex flex-col gap-2 border-b border-foreground/10 py-4">
      <div className="flex items-start justify-between gap-x-6">
        <div className="min-w-0">
          {/* 行の名前は分野（h3）の下の見出し。行の高さをアイコン（28px）と同じにして、アイコンを1行目の真ん中に揃える */}
          <h4 className="flex items-start gap-2 text-base font-normal leading-7">
            <Hint label={label}>
              <span className="flex shrink-0 text-primary">
                {up ? <UpIcon className="size-7" /> : <NewIcon className="size-7" />}
                <span className="sr-only">{label}</span>
              </span>
            </Hint>
            {/* 資料のリンクは名前の後ろに続けて置き、名前が折り返したときも最後の行の後ろに入るならそこへ入れる */}
            <span className="min-w-0">
              {title}
              {source ? (
                <a href={source.href} target="_blank" rel="noopener" className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap align-baseline text-xs text-muted-foreground underline-offset-4 hover:underline">
                  {source.label}
                  <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
                </a>
              ) : null}
            </span>
          </h4>
        </div>
        <span className="shrink-0 text-right">
          <YenText yen={yen} className="block leading-7" />
          {people && yen ? <span className="block text-xs text-muted-foreground tabular-nums">1人 {formatPerCapita(yen / people)}</span> : null}
        </span>
      </div>
      {children}
    </div>
  )
}

/** 資料の PDF の該当ページへのリンク。PDF の #page で開く。リンク名は何の資料で何ができるかを言う（頁番号は出さない） */
const pdfPage = (pdf: string | undefined, page: number, label: string) => (pdf ? { href: `${pdf}#page=${page}`, label } : undefined)

/** 評価の枠。1行目に区分と方向性、2行目にその中身を置く */
function EvalBox({ grade, direction, children }: { grade: string; direction: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-xl bg-sidebar px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground [text-wrap:pretty]">
      <p>
        <span className="mr-2 align-middle">評価</span>
        <Grade grade={grade} />（{direction}）
      </p>
      <p>{children}</p>
    </div>
  )
}

/** 今ある事業の中で始めた取り組み。何を始めたかはシートの文をそのまま引き、金額と評価は含まれる事業全体のものだと文で言う */
function InitiativeItem({ p, sheets }: { p: Initiative; sheets?: string }) {
  return (
    <FreshRow up upLabel="今ある事業の中で" title={p.title} yen={p.settledYen} source={pdfPage(sheets, p.page, '評価シート')}>
      <p className="text-sm [text-wrap:pretty]">「{p.quote}」</p>
      <EvalBox grade={p.grade} direction={p.direction}>
        この取り組みだけの評価はない。金額と評価は、含まれる事業「{p.name}」全体の決算額と評価。
      </EvalBox>
    </FreshRow>
  )
}

/** 予算案のプレス発表資料の施策。見出しは頁の見出し（「〜」の副題は外す）、金額は資料の予算額、その下に POINT を資料の文のまま並べる。
 * 出すのは事業名に「新規」の印がある施策だけ（サーバーの withPress で絞る）。予算書の内訳への紐付けは分野分けにだけ使い、画面には出さない */
function BudgetItem({ p, press }: { p: PressItem; press?: string }) {
  const title = p.title.replace(/[~〜～].*$/, '').trim() || p.names.join('・')
  return (
    <FreshRow up={!p.isNew} title={title} yen={p.budgetYen} source={pdfPage(press, p.page, '発表資料')}>
      {p.points.length ? (
        <ul className="flex flex-col gap-1 rounded-xl bg-sidebar px-3.5 py-2.5 text-[13px] leading-relaxed [text-wrap:pretty]">
          {p.points.map((pt, i) => (
            <li key={i} className="relative pl-3.5 before:absolute before:left-0 before:top-[0.6em] before:size-1.5 before:rounded-full before:bg-primary/60">{pt}</li>
          ))}
        </ul>
      ) : null}
    </FreshRow>
  )
}

/** 分野の中の事業。金額の大きい3件を出し、残りは薄く消えていく1件だけ見せて「もっと見る」で limit 件ずつ開く */
const FRAME_PREVIEW = 3
/** 閉じているときに見せる、薄く消える行の高さ（px） */
const FRAME_PEEK = 96
/** 「見る」1回で開く件数の既定値 */
const FRAME_LIMIT = 25
/** 開閉で高さが動く時間（ms）。Tailwind の duration-300 と揃える */
const FRAME_DURATION = 300

/** ブラウザの smooth は時間を決められないので、指定の時間で ease-out にスクロールする */
function scrollToIn(top: number, ms: number) {
  const from = window.scrollY
  if (ms <= 0) return window.scrollTo(0, top)
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    window.scrollTo(0, from + (top - from) * (1 - (1 - t) ** 3))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function FrameItems<T>({ items, render, limit = FRAME_LIMIT }: { items: T[]; render: (item: T) => React.ReactNode; /** 1回の「見る」で開く件数 */ limit?: number }) {
  // 開いている残りの件数。0 は閉じている
  const [count, setCount] = React.useState(0)
  const open = count > 0
  // 高さは閉じているとき FRAME_PEEK、開くときは中身の高さへ動かし、開き終わったら auto にして幅の変化に追従させる
  const [height, setHeight] = React.useState<number | 'auto'>(FRAME_PEEK)
  // 「さらに見る」で行を足したあと、足した分の高さまで動かす
  const grow = React.useRef(false)
  const wrap = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  // 押したボタンは開閉で入れ替わって消えるので、描き直したあと次に押すボタンへフォーカスを移す
  const refocus = React.useRef(false)
  const restItems = items.slice(FRAME_PREVIEW)
  const rest = restItems.length
  React.useLayoutEffect(() => {
    if (!grow.current || !body.current) return
    grow.current = false
    const el = body.current
    requestAnimationFrame(() => setHeight(el.scrollHeight))
  }, [count])
  React.useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    wrap.current?.querySelector<HTMLButtonElement>('[data-frame-toggle]')?.focus({ preventScroll: true })
  }, [count])
  if (rest <= 0) return <>{items.map(render)}</>
  const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const more = () => {
    const el = body.current
    if (!el) return
    const next = Math.min(rest, count + limit)
    // 開くとき・最後の「もっと見る」を押したときはボタンが入れ替わる
    refocus.current = !open || next >= rest
    if (!open) {
      // 閉じているときも最初の limit 件までは描いてあるので、その高さへそのまま動かす
      setCount(next)
      // 動きを減らす設定では transition が走らず transitionend も来ないので、最初から auto にする
      setHeight(still() ? 'auto' : el.scrollHeight)
      return
    }
    setCount(next)
    if (still()) return
    // 今の高さを固定してから行を足し、足した分の高さへ動かす
    setHeight(el.scrollHeight)
    grow.current = true
  }
  const close = () => {
    const el = body.current
    if (!el) return
    // 閉じるときは今の高さを固定してから縮める。同時に、最後に見せている行（3件目）が画面の真ん中に来るまで、縮みと同じ時間でスクロールを戻す
    setHeight(el.scrollHeight)
    requestAnimationFrame(() => requestAnimationFrame(() => setHeight(FRAME_PEEK)))
    setCount(0)
    refocus.current = true
    const last = wrap.current?.previousElementSibling
    if (!last) return
    const r = last.getBoundingClientRect()
    const target = Math.max(0, window.scrollY + r.top + r.height / 2 - window.innerHeight / 2)
    if (target < window.scrollY) scrollToIn(target, still() ? 0 : FRAME_DURATION)
  }
  const left = rest - count
  const button = 'rounded-full bg-background px-5 shadow-sm transition-colors hover:bg-card aria-expanded:bg-background'
  return (
    <>
      {items.slice(0, FRAME_PREVIEW).map(render)}
      {/* 残りは limit 件ずつ描く。閉じているときは1件目だけ薄く消える形で見せる。開くボタンはその上の真ん中、開いたあとは最後の行の下の真ん中に置く */}
      <div ref={wrap} className="relative flex flex-col items-center">
        <div
          ref={body}
          inert={!open}
          aria-hidden={!open}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && open) setHeight('auto')
          }}
          style={{ height }}
          className={`w-full overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none ${open ? '' : 'pointer-events-none [mask-image:linear-gradient(to_bottom,black_10%,transparent)]'}`}
        >
          {restItems.slice(0, open ? count : Math.min(limit, rest)).map(render)}
        </div>
        {open ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {left > 0 ? (
              <Button variant="outline" onClick={more} aria-expanded data-frame-toggle className={button}>
                もっと見る
                <CaretDownIcon aria-hidden="true" className="size-3.5" />
              </Button>
            ) : null}
            <Button variant="outline" onClick={close} data-frame-toggle className={button}>
              閉じる
              <CaretDownIcon aria-hidden="true" className="size-3.5 rotate-180" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={more} aria-expanded={false} data-frame-toggle className={`${button} absolute bottom-2 left-1/2 -translate-x-1/2`}>
            もっと見る
            <CaretDownIcon aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>
    </>
  )
}

function ProjectItem({ p, sheets }: { p: EvaluatedProject; sheets?: string }) {
  const i = p.indicator
  return (
    // 金額は名前と同じ行の右に置き、評価の枠は幅いっぱいに出す。値はどれも評価シートのもの
    <FreshRow up={false} title={p.title} yen={p.settledYen} source={pdfPage(sheets, p.page, '評価シート')}>
      <p className="text-sm">{p.what}</p>
      {/* 指標は区分と同じ大きさ・色で読ませる。指標の良し悪しは風土記が判断しない */}
      <EvalBox grade={p.grade} direction={p.direction}>
        {i ? `指標の「${i.name}」は、目標 ${i.target}${i.unit}に対して実績 ${i.actual}${i.unit}。` : '目標と実績を並べた指標は載っていない。'}
      </EvalBox>
    </FreshRow>
  )
}

/** 分野（domains.ts）の id ごとの icon */
const DOMAIN_ICON: Record<string, typeof BankIcon> = {
  bosai: ShieldCheckIcon, fukushi: HandHeartIcon, kyoiku: StudentIcon, iryo: FirstAidKitIcon, kurashi: HouseLineIcon,
  sangyo: StorefrontIcon, kankyo: LeafIcon, bunka: BasketballIcon, gyosei: BankIcon, other: DotsThreeCircleIcon,
}

/** 強調する金額。数字を大きく、単位（億円・万円）と「約」は小さくする */
function Emph({ text }: { text: string }) {
  const [, pre = '', num = text, unit = ''] = /^(約?)([\d,.]+)(.*)$/.exec(text) ?? []
  return (
    <b className="mx-1 whitespace-nowrap font-normal tabular-nums text-primary">
      {pre ? <span className="text-sm">{pre}</span> : null}
      <span className="text-2xl">{num}</span>
      <span className="ml-0.5 text-sm">{unit}</span>
    </b>
  )
}

/** 区政を知らない人の入口。自治体の仕事を分野の例で見せ、1年に使うお金を住民1人あたりで言う（最新の決算） */
function Overview({ data, sections, year }: { data: PageData; sections: Set<string>; year: number }) {
  const latest = data.years.at(-1)
  const people = data.population?.people
  const kind = data.name.slice(-1)
  // 決算がまだ無い年度は、その年度の当初予算を出す（最新の決算の額を出すと、選んだ年度の額に読める）
  const budget = (data.budgets ?? []).find((b) => b.year === year)
  const shown = budget ? { yen: budget.yen, lead: `${reiwa(year)}の予算は` } : latest ? { yen: latest.yen, lead: `${reiwa(latest.year)}に使ったお金は` } : null
  return (
    <Section id="about" title={`${kind}は何をしている？`}>
      {shown && latest ? (
        <p className="text-[15px]">
          {/* スマホで折り返すときは予算と1人あたりの間で折る（数字と単位の途中で折らない） */}
          {people ? (
            <>
              <span className="inline-block">{shown.lead}<Emph text={formatYen(shown.yen)} />、</span>
              <span className="inline-block">住民1人あたり<Emph text={`${Math.round(shown.yen / people / 1e4).toLocaleString('ja-JP')}万円`} />です。</span>
            </>
          ) : (
            <span className="inline-block">{shown.lead}<Emph text={formatYen(shown.yen)} />です。</span>
          )}
          {!budget && year !== latest.year ? (
            <span className="mt-1 block text-[13px] text-muted-foreground">{data.years.some((y) => y.year === year) ? '' : `${reiwa(year)}の決算はまだ収録していないため、`}ここの金額は収録している最新の決算（{reiwa(latest.year)}）のものです。</span>
          ) : null}
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-x-8 border-t sm:grid-cols-2">
        {[...DOMAIN_FRAMES.filter((f) => f.examples), OTHER_FRAME].map((f) => {
          // 最新の決算（決算の無い年度は当初予算）を COFOG の大分類で分けた額（お金の流れの機能分類と同じ分け方）
          const id = `cofog-${f.cofog || 'none'}`
          const spent = budget ? budget.divisions.find((d) => d.id === id) : data.cofogFlow.find((d) => d.kan.id === id)?.kan
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
                {/* 分野の額は全体に占める割合で出し、その下に住民1人あたりの額を小さく添える */}
                {spent && !spent.amountMissing && shown?.yen ? (
                  <>
                    <span className="block text-primary"><span className="text-xl">{((spent.yen / shown.yen) * 100).toFixed(1)}</span><span className="ml-0.5 text-xs">%</span></span>
                    {people ? <span className="block text-xs text-muted-foreground">1人 {(Math.round(spent.yen / people / 1e3) / 10).toLocaleString('ja-JP')}万円</span> : null}
                  </>
                ) : (
                  <span className="block text-[15px] text-muted-foreground">{spent ? '金額未記載' : '—'}</span>
                )}
              </div>
              </DomainLink>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** 分野の行。その年度の「新しく何を始めた（始める）？」にその分野があれば、そこへ移るリンクにする */
function DomainLink({ section, children }: { section?: string; children: React.ReactNode }) {
  // アイコン・名前・金額の3列を全行で同じ幅にし、行は隣の列の行と同じ高さいっぱいに広げて中央に揃える
  const row = 'grid h-full grid-cols-[1.75rem_minmax(0,1fr)_5.5rem] items-center gap-3 py-3'
  if (!section) return <div className={row}>{children}</div>
  return (
    <a
      href={`#${section}`}
      // 目次と同じく URL を節の fragment に変えない
      onClick={(e) => { const t = document.getElementById(section); if (!t) return; e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }) }}
      className={`${row} text-foreground no-underline transition-colors hover:bg-card`}
    >
      {children}
    </a>
  )
}

function Domains({ year, fiscalYear }: { year: ProfileYear; fiscalYear: number }) {
  const fresh = freshOf(year)
  const groups = groupByFrame(fresh)
  const byBudget = isPlanned(year)
  const lead = byBudget
    ? '区が予算案の発表で取り上げた、この年度に新しく始める事業です。'
    : '区が事業ごとに目標と実績を振り返る「事業評価」から、この年度に新しくできた事業と、今ある事業の中で始めた取り組みを並べています。'
  const link = !groups.length ? undefined : byBudget ? (year.budgetPress ? { href: year.budgetPress, label: 'プレス発表' } : undefined) : { href: year.evaluationSource, label: '事業評価' }
  return (
    <Section id="domains" title={freshTitle(year)} lead={lead} link={link}>
      {/* 事業評価は実施した翌年度に公表する。予算の資料も無い年度は節だけ出し、なぜ空かを言う */}
      {groups.length ? null : <p className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">{reiwa(fiscalYear)}の事業の評価は、{reiwa(fiscalYear + 1)}に公表されます。まだ公表されていません。</p>}
      {groups.map(({ frame: d, items }) => (
        <div key={d.id} id={`d-${d.id}`} className="flex scroll-mt-32 @4xl:scroll-mt-20 flex-col gap-1 [&+&]:mt-12">
          <h3 className="mb-1.5 flex items-center gap-2.5 text-[19px] leading-snug sm:text-[22px]">
            <DomainIcon id={d.id} />
            {d.name}
          </h3>
          <div className="flex flex-col border-t">
            <FrameItems items={items} render={(p) => (p.kind === 'sheet' ? <ProjectItem key={`s${p.page}`} p={p} sheets={year.evaluationSheets} /> : p.kind === 'initiative' ? <InitiativeItem key={`i${p.page}-${p.title}`} p={p} sheets={year.evaluationSheets} /> : <BudgetItem key={`b${p.page}`} p={p} press={year.budgetPress} />)} />
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
        <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-emblem p-1.5">
          {logo ? <img src={logo} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <Icon aria-hidden="true" className="size-6 text-primary" />}
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

function DomainIcon({ id, className }: { id: string; className?: string }) {
  const Icon = DOMAIN_ICON[id]
  if (!Icon) return <span aria-hidden="true" className="h-6 w-1 rounded-full bg-primary" />
  return <Icon aria-hidden="true" className={cn('size-6 shrink-0 text-primary sm:size-7', className)} />
}

function ProjectRow({ p, rank, max, total, people, showChange, shown }: { p: Project; rank: number; max: number; total?: number; people?: number; showChange: boolean; shown: boolean }) {
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
      <div className={`grid grid-cols-[22px_minmax(0,1fr)_auto] items-baseline gap-x-3.5 gap-y-2 py-4 ${showChange ? 'sm:grid-cols-[22px_minmax(140px,200px)_1fr_150px_80px]' : 'sm:grid-cols-[22px_minmax(140px,200px)_1fr_150px]'} sm:items-center`}>
        <span className="text-xl tabular-nums">{rank}</span>
        <div className="min-w-0">
          <h3 className="text-base font-normal leading-snug">{p.name}</h3>
          {/* 分野は名前の下に、薄い枠だけのラベルで控えめに出す（名前より目立たせない。塗ると年度の切り替えと同じ形になり押せそうに見える）。icon は「新しく何を始める？」の分野と同じ */}
          <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-foreground/10 py-px pl-1 pr-1.5 text-xs text-muted-foreground">
            <DomainIcon id={DOMAIN_FRAMES.find((f) => f.name === p.domain)?.id ?? OTHER_FRAME.id} className="size-3 text-muted-foreground sm:size-3" />
            {p.domain}
          </span>
        </div>
        {/* 棒は1位を満たした長さ。スマホでは名前の下に、名前の左端から並べる */}
        <div className="order-5 col-span-2 col-start-2 sm:order-none sm:col-span-1 sm:col-start-auto">
          <div className="h-2 overflow-hidden rounded-full bg-foreground/5">
            {/* 画面に入ったら、上の順位から少しずつ遅らせて伸ばす */}
            <div className="h-full rounded-full bg-primary transition-[width] duration-[1200ms] ease-out motion-reduce:transition-none" style={{ width: shown ? `${(p.yen / max) * 100}%` : 0, transitionDelay: `${(rank - 1) * 120}ms` }} />
          </div>
        </div>
        <div className="text-right">
          {p.amountMissing ? (
            <span className="text-sm text-muted-foreground">金額未記載</span>
          ) : (
            <>
              {/* 全体に占める割合を大きく出し、金額と1人あたりはその下に薄く */}
              {total ? (
                <span className="block leading-snug tabular-nums">
                  <span className="mr-0.5 text-xs text-muted-foreground">全体の</span>
                  <span className="text-xl">{((p.yen / total) * 100).toFixed(1)}</span>
                  <span className="ml-0.5 text-xs">%</span>
                </span>
              ) : null}
              <span className="flex justify-end gap-x-2 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                <span>{formatYen(p.yen)}</span>
                {people ? <span>1人 {formatPerCapita(p.yen / people)}</span> : null}
              </span>
            </>
          )}
        </div>
        {showChange ? (
          <div className="hidden text-right text-base tabular-nums sm:block">
            {pct === null ? '—' : `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}
            <i className="block text-xs not-italic text-muted-foreground">前年度比</i>
          </div>
        ) : null}
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
/** お金の流れの分け方。既定は機能分類（目的で分ける COFOG を domains.ts の枠にまとめたもの）で、どの自治体も同じ枠で比べられる。自治体分類は予算書・決算書の款・項のまま */
const VIEWS: { key: FlowView; label: string }[] = [
  { key: 'cofog', label: '機能分類' },
  { key: 'kan', label: '自治体分類' },
]

/** お金の流れの節。決算があればその年度の決算、無ければ当初予算を出す（決算と予算は切り替えない）。予算の年度は見出しを「使う」と言う */
function Budget({ data, year }: { data: PageData; year: number }) {
  const [view, setView] = React.useState<FlowView>('cofog')
  const settled = data.years.find((y) => y.year === year)
  const budget = settled ? undefined : (data.budgets ?? []).find((b) => b.year === year)
  const total: YearTotal | undefined = settled ?? (budget ? { year, yen: budget.yen, kan: budget.kan } : undefined)
  const prev = settled ? data.years.find((y) => y.year === year - 1) : undefined
  const pct = total && prev ? changePct(total.yen, prev.yen) : null
  const label = budget ? '予算' : '決算'
  // その年度の決算書（無ければ予算書）の歳出を載せた冊の PDF を直接開く。公表前・未選定の冊は出さない
  const documents = data.profile?.years[year]?.documents
  const docs = (budget ? documents?.initial : documents?.settlement) ?? []
  const summary = (
    <>
      {/* スマホでは名前（と前年度比）の行の下に金額を置く。広い画面では「全体 金額 前年度比」と横に並べる */}
      <span className="flex gap-x-2 text-sm text-muted-foreground sm:contents">
        <span className="shrink-0">全体</span>
        {pct !== null ? <span className="truncate tabular-nums sm:order-last">前年度比 {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span> : null}
      </span>
      <b className={`shrink-0 text-[26px] font-normal leading-snug tabular-nums ${total ? '' : 'text-muted-foreground'}`}>{total ? formatYen(total.yen) : '—'}</b>
    </>
  )
  // 分け方の切り替えはヘッダーの年度の切り替えと同じ丸いボタンの並びにする
  const tabs = (
    <div className="flex items-center justify-between gap-3">
      {/* 左上に、この図が予算か決算かを出す */}
      <span className="text-lg">{label}</span>
      <div role="group" aria-label="分類" className="flex gap-1">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={v.key === view}
          onClick={() => setView(v.key)}
          className={`rounded-full px-2.5 py-1.5 text-[13px] transition-colors ${v.key === view ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {v.label}
        </button>
      ))}
      </div>
    </div>
  )
  return (
    <Section
      id="budget"
      title={budget ? 'お金は何に使う？' : 'お金は何に使われた？'}
      lead="機能分類は、使い道を目的ごとに分ける世界共通の分類（COFOG）です。独自評価のため誤っていることがあります。自治体分類は、予算書・決算書の分け方のまま表示。"
      link={docs.length ? docs : undefined}
    >
      <div id="budget-panel" data-ask-view={`${reiwa(year)}の${label}の金額（${VIEWS.find((v) => v.key === view)!.label}）`} className="flex flex-col gap-4">
        {total ? (
          <Flow key={`${year}-${view}`} data={data} total={total} view={view} phase={budget ? 'initial' : 'settlement'} tabs={tabs} summary={summary} />
        ) : (
          <div className="rounded-[20px] border bg-background px-5 pt-5 sm:px-6">
            {tabs}
            <div className="mt-3 flex min-h-9 min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-x-3">{summary}</div>
            <p className="pb-10 pt-4 text-center text-sm text-muted-foreground">{yearName(year)}の決算・予算は、まだ収録していません</p>
          </div>
        )}
      </div>
    </Section>
  )
}

/** 要素が画面に入ったら true になる（一度だけ）。棒グラフを画面に入ったときに伸ばすのに使う */
function useInView<T extends Element>(): [(el: T | null) => void, boolean] {
  // 要素は callback ref で受け取る。年度の切り替えで要素が作り直されても、新しい要素を見張り直す
  const [el, setEl] = React.useState<T | null>(null)
  const [seen, setSeen] = React.useState(false)
  React.useEffect(() => {
    if (!el || seen) return
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect() } }, { rootMargin: '0px 0px -10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [el, seen])
  return [setEl, seen]
}

/** 金額が大きい事業（目）。最新の決算の年度は決算、決算の無い年度は当初予算から出す */
function Projects({ data, year }: { data: PageData; year: number }) {
  const settled = data.years.find((y) => y.year === year)
  const isLatest = !!settled && settled.year === data.years.at(-1)?.year
  const budget = settled ? undefined : (data.budgets ?? []).find((b) => b.year === year)
  const projects = isLatest ? data.projects : (budget?.projects ?? [])
  const max = projects[0]?.yen ?? 1
  // 割合の分母は、同じ年度・同じ段階の一般会計の歳出の合計（お金は何に使う？の「全体」と同じ）
  const total = isLatest ? settled?.yen : budget?.yen
  // 予算の年度は前年度との比較を持たないので、列ごと出さない
  const showChange = projects.some((p) => p.prevYen != null)
  const [listRef, shown] = useInView<HTMLUListElement>()
  return (
    <Section id="projects" title={budget ? 'いちばんお金がかかるのは？' : 'いちばんお金がかかっているのは？'}>
      {projects.length ? (
        <ul ref={listRef} className="border-t">
          {projects.map((p, i) => (
            <ProjectRow key={p.id} p={p} rank={i + 1} max={max} total={total} people={data.population?.people} showChange={showChange} shown={shown} />
          ))}
        </ul>
      ) : (
        <Empty>{settled ? `${yearName(year)}の事業の一覧は、まだ出していません` : `${yearName(year)}の決算・予算は、まだ収録していません`}</Empty>
      )}
    </Section>
  )
}

/** 評価の方向性（A〜C は今後の取組の方向性、D は評価結果の表の区分）ごとの印と言い方。言葉は印の説明（ヒントと凡例）にだけ使う */
const MARKS: Record<string, { Icon: (p: { className?: string }) => React.ReactNode; label: string }> = {
  新規の取組み: { Icon: NewIcon, label: '新しい取り組みを始める' },
  '対象・規模等の拡大': { Icon: UpIcon, label: '対象・規模を広げる' },
  現状維持: { Icon: KeepIcon, label: '今のまま続ける' },
  '法定受託事務・法定扶助費等': { Icon: LawIcon, label: '法令で決まっている' },
  '計画・規定どおり': { Icon: PlanIcon, label: '計画どおり続ける' },
  手法等の改善: { Icon: FixIcon, label: 'やり方を見直す' },
  '対象・規模等の見直し': { Icon: SizeIcon, label: '対象・規模を見直す' },
  取組みの一部廃止: { Icon: CutIcon, label: '一部をやめる' },
  完了: { Icon: DoneIcon, label: '完了した' },
  '移管・統合': { Icon: JoinIcon, label: 'ほかの事業へ統合' },
  廃止: { Icon: StopIcon, label: 'やめた' },
  廃止を検討: { Icon: MaybeStopIcon, label: 'やめるか検討中' },
}

function Mark({ kind }: { kind: string }) {
  const m = MARKS[kind]
  if (!m) return null
  return (
    <Hint label={m.label}>
      {/* 意味は隣の「今後の方向」の列が文字で伝えるので、読み上げでは印を飛ばす */}
      <span aria-hidden="true" className="absolute -top-[3px] left-0 flex text-primary">
        <m.Icon className="size-6" />
      </span>
    </Hint>
  )
}

/** 行の印ごとの件数。MARKS の順に並べる */
const legendOf = (rows: { kind: string }[]) => Object.keys(MARKS).map((k) => [k, rows.filter((r) => r.kind === k).length] as const).filter(([, n]) => n > 0)

function ScrapSection({ scrap }: { scrap: Scrap }) {
  const grades = [
    ['A', '広げる'],
    ['B', '続ける'],
    ['C', '見直す'],
    ['D', '終える'],
  ] as const
  const [picked, setGrade] = React.useState<'A' | 'B' | 'C' | 'D'>('D')
  // A〜C の一覧を持たない年度は D に丸める（年度を切り替えたときに、押せない区分が選ばれたまま残らないように）
  const grade = scrap.graded ? picked : 'D'
  const ready = (g: string) => g === 'D' || !!scrap.graded
  // 矢印キーで区分を移る（radio group の操作）。押せない区分は飛ばす
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const keys = grades.map(([g]) => g).filter(ready)
    const next = keys[(keys.indexOf(grade) + step + keys.length) % keys.length]!
    setGrade(next)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-grade="${next}"]`)?.focus()
  }
  const rows = grade === 'D' ? scrap.exits.map((e, i) => ({ i, name: e.name, kind: e.result, page: e.page })) : (scrap.graded?.[grade] ?? []).map((p, i) => ({ i, name: p.name, kind: p.direction, page: p.page }))
  const cols = 'sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]'
  return (
    <Section id="scrap" title="やめたこと・見直したことは？" link={{ href: scrap.source, label: '事業評価の結果' }} lead="自治体は毎年、前の年度までに行った事業を評価して、やめる事業や減らす事業を決め、その分を新しい予算に回しています。">
      <h3 className="text-lg">自治体が付けた評価（{scrap.evaluated.toLocaleString('ja-JP')}事業）</h3>
      {/* 評価の区分はカードで選び、下にその区分の事業を出す。最初は D（終える＝完了・統合・やめた事業）を見せる */}
      <div role="radiogroup" aria-label="評価の区分" onKeyDown={onKey} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {grades.map(([g, label]) => {
          const on = g === grade
          return (
            <button key={g} type="button" role="radio" data-grade={g} aria-checked={on} tabIndex={on ? 0 : -1} disabled={!ready(g)} onClick={() => setGrade(g)} className={cn('flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'border-foreground/10 hover:bg-foreground/[0.03]', !ready(g) && 'cursor-default opacity-60 hover:bg-transparent')}>
              <Grade grade={`${g} ${label}`} className="text-sm" />
              <span className="pl-[26px] tabular-nums"><b className="text-2xl font-normal">{scrap.grades[g]}</b><small className="ml-0.5 text-sm">事業</small></span>
            </button>
          )
        })}
      </div>
      {/* 一覧が区分の全件でないときは、そのことを書く */}
      {!scrap.graded || (grade === 'D' && scrap.exits.length !== scrap.grades.D) ? (
        <p className="text-[13px] text-muted-foreground">
          {!scrap.graded ? 'この年度は A〜C の事業の一覧を出していません。' : ''}
          {grade === 'D' && scrap.exits.length !== scrap.grades.D ? `D の${scrap.grades.D}事業のうち、区が結果を示した${scrap.exits.length}事業を出しています。` : ''}
        </p>
      ) : null}
      {/* 選んだ区分にある印の凡例。行には印だけを付ける */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
        {legendOf(rows).map(([kind, n]) => {
          const m = MARKS[kind]!
          return (
            <li key={kind} className="flex items-center gap-1.5">
              <m.Icon className="size-5 text-primary" />
              {m.label}
              <span className="tabular-nums">{n}</span>
            </li>
          )
        })}
      </ul>
      {/* 表の形で並べる。資料のリンクは最後の列。狭い画面では列を縦に積む */}
      <div key={grade} role="table" aria-label={`${grade} ${grades.find(([g]) => g === grade)?.[1] ?? ''}の事業`} className="text-sm">
        <div role="row" className={`hidden gap-x-4 border-b py-2 text-xs text-muted-foreground sm:grid ${cols}`}>
          <span role="columnheader" className="pl-8">事業</span>
          <span role="columnheader">今後の方向</span>
          <span role="columnheader" className="text-right">資料</span>
        </div>
        <FrameItems
          items={rows}
          render={(r) => (
            <div role="row" key={r.i} className={`grid grid-cols-1 items-baseline gap-x-4 gap-y-1 border-b border-foreground/10 py-3 ${cols}`}>
              <span role="cell" className="relative pl-8">
                <Mark kind={r.kind} />
                {r.name}
              </span>
              <span role="cell" className="pl-8 text-[13.5px] text-muted-foreground sm:pl-0">{MARKS[r.kind]?.label ?? r.kind}</span>
              <span role="cell" className="pl-8 sm:pl-0 sm:text-right">
                <a href={`${scrap.sheets}#page=${r.page}`} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-muted-foreground underline-offset-4 hover:underline">
                  評価シート
                  <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
                </a>
              </span>
            </div>
          )}
        />
      </div>
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

// 以前の年度の URL（#y2025）。開かれたら年度の頁の path（/tokyo/shinagawa/2025）に置き換える
const yearFromHash = () => Number(/^#y(\d{4})$/.exec(location.hash)?.[1]) || undefined
/** 今の URL から年度の段を除いた、自治体の頁の path */
const basePath = () => location.pathname.replace(/\/\d{4}\/?$/, '')

export function Page({ data, sitekey, initialYear }: { data: PageData; sitekey: string; initialYear?: number }) {
  const profile = data.profile ?? null
  const years = React.useMemo(() => pageYears(data), [data])
  // サーバーで書いた HTML と同じ年度で始める（年度の頁ならその年度）。古い #y2025 は描いたあとに反映する（hydration の食い違いを避ける）
  const [year, setYear] = React.useState(initialYear ?? years[0]!)
  React.useEffect(() => {
    const y = yearFromHash()
    if (y && years.includes(y)) choose(y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years])
  React.useEffect(() => rememberJurisdiction({ code: data.code, name: data.name, path: basePath() }), [data.code, data.name])
  const py = profile?.years[String(year)]
  // 基本構想の都市像。年度で変わらない
  const vision = profile?.vision?.text
  // 年度を選んだら、その年度の頁の path にする（検索に載る URL と同じ。既定の年度は自治体の頁そのもの）
  const choose = (y: number) => {
    setYear(y)
    history.replaceState(null, '', yearPath(basePath(), y, years[0]!))
    // 頁は読み直さないので、タブの title もその年度の頁と同じにする
    document.title = pageHead(data, y === years[0] ? undefined : y).title
  }

  const money: TocItem[] = [
    { href: '#budget', label: 'お金の使い道' },
    { href: '#projects', label: '大きな支出' },
  ]
  // 区政を知らない人には金額より暮らしの具体例が先。変わったことから入り、お金の内訳へ進む
  const fresh: TocItem[] = py ? [{ href: '#domains', label: isPlanned(py) ? '新しく始めること' : '新しく始めたこと' }, ...groupByFrame(freshOf(py)).map(({ frame: d }) => ({ href: `#d-${d.id}`, label: d.name, sub: true }))] : []
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
  // 目次の移動で URL を節の fragment に変えない
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

  const logo = EMBLEMS[data.code] ? assetPath(data.code, 'emblem.svg') : null

  return (
    <>
      <div className={`fixed left-0 right-(--side-panel,0px) top-0 z-30 md:left-(--nav-w) border-b bg-background transition-[transform,right] duration-200 ease-out motion-reduce:transition-none ${mini ? '' : '-translate-y-full'}`} aria-hidden={!mini} inert={!mini}>
        <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-3 px-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-emblem p-1 sm:size-10">{logo ? <img src={logo} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <span className="text-foreground">{data.name[0]}</span>}</span>
          <b className="shrink-0 text-lg font-normal">{data.name}</b>
          {vision ? <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:block">{vision}</span> : null}
          {years.length > 1 ? (
            <div className="ml-auto shrink-0">
              <YearPicker years={years} current={year} onChange={choose} />
            </div>
          ) : null}
        </div>
      </div>

      {/* 目次は本文の幅で切り替える（会話を横に開いて本文が狭くなったら、左の目次を閉じて上の横並びにする） */}
      <div className="@container mx-auto max-w-[1120px] px-4 pb-48">
        <header ref={headerRef} className="relative grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 border-b py-7 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-7">
          {years.length > 1 ? (
            <div ref={pickerRef} className={headerWide ? 'col-span-full -mb-2 justify-self-end sm:absolute sm:right-0 sm:top-7 sm:mb-0' : 'col-span-full -mb-2 justify-self-end'}>
              <YearPicker years={years} current={year} onChange={choose} />
            </div>
          ) : null}
          <div className="grid size-20 place-items-center rounded-xl border bg-emblem p-2.5 sm:size-[132px] sm:rounded-2xl sm:p-[18px]">
            {logo ? <img src={logo} alt="" className="size-full min-h-0 min-w-0 object-contain" /> : <span className="text-3xl text-foreground sm:text-5xl">{data.name[0]}</span>}
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

        <nav ref={spBar} aria-label="目次" className={`sticky z-20 -mx-4 flex gap-5 overflow-x-auto border-b bg-background px-4 [scrollbar-width:none] @4xl:hidden ${mini ? 'top-[61px]' : 'top-0'}`}>
          {toc.filter((t) => !t.sub).map((t) => (
            <a key={t.href} href={t.href} onClick={jump} data-current={isCurrent(t.href) || undefined} className="relative shrink-0 py-3 text-[13.5px] text-muted-foreground no-underline after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full data-[current]:text-foreground data-[current]:after:bg-primary">
              {t.label}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-12 pt-6 @4xl:grid-cols-[220px_minmax(0,1fr)] @4xl:pt-8">
          <nav aria-label="目次" className="sticky top-[84px] hidden flex-col gap-0.5 self-start @4xl:flex">
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
            <Overview data={data} year={year} sections={new Set(py ? groupByFrame(freshOf(py)).map(({ frame }) => frame.id) : [])} />
            {py ? <PeopleContext.Provider value={data.population?.people}><Domains year={py} fiscalYear={year} /></PeopleContext.Provider> : null}
            <Budget data={data} year={year} />
            <Projects data={data} year={year} />
            {py?.scrap ? <ScrapSection key={year} scrap={py.scrap} /> : null}
            <Elsewhere data={data} />
          </main>
        </div>
      </div>

      <AskDock name={data.name} sitekey={sitekey} year={year} section={toc.find((t) => isCurrent(t.href))?.label} />
    </>
  )
}

/** AI に聞く入力欄。最初は開いておき、読み進めるか Escape で右下のボタンに畳む。押すか「/」、頁の文を選んで文脈が入ったときに開く。
 * 送ると頁を移らずに会話を開く。広い画面では右の side panel（頁は読み続けられる）、スマホでは下からの drawer。閉じても会話は残り、右下のボタンで戻れる */
const DOCK_CLOSE_AFTER = 80
/** 選んだ文として AI に渡す長さの上限 */
const QUOTE_MAX = 600
/** 選択が最後に動いてから、これだけ待って聞く欄を開く */
const QUOTE_OPEN_DELAY = 350
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

/** 一定より下までスクロールしたら左下（質問のボタンと同じ高さ）に出す、頁の先頭へ戻るボタン */
const BACK_TO_TOP_AFTER = 800
function BackToTop({ hidden }: { hidden: boolean }) {
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    const onScroll = () => setShown(window.scrollY > BACK_TO_TOP_AFTER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const off = hidden || !shown
  return (
    <Hint label="上に戻る">
      <button
        type="button"
        aria-label="上に戻る"
        onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
        tabIndex={off ? -1 : 0}
        aria-hidden={off}
        className={`fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-20 grid size-11 place-items-center rounded-full border bg-background text-muted-foreground shadow-md transition-[opacity,transform] duration-200 hover:border-primary hover:text-foreground max-md:bottom-[calc(16px+var(--bottom-nav))] md:left-[calc(var(--nav-w)+16px)] motion-reduce:transition-none ${off ? 'pointer-events-none translate-y-4 opacity-0' : ''}`}
      >
        <ArrowUpIcon className="size-4" aria-hidden="true" />
      </button>
    </Hint>
  )
}

function AskDock({ name, sitekey, year, section }: { name: string; sitekey: string; year: number; section?: string }) {
  const [open, setOpen] = React.useState(true)
  const [chat, setChat] = React.useState<{ id: string; session: StoredSession }>()
  const [drawer, setDrawer] = React.useState(false)
  const [quote, setQuote] = React.useState('')
  const dock = React.useRef<HTMLDivElement>(null)
  const sheet = React.useRef<HTMLDivElement>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const anchor = React.useRef(0)
  /** 指やマウスを押している間 true。選択を広げている途中で聞く欄を開かない */
  const held = React.useRef(false)
  /** 文脈で聞く欄を開く予約を取り消す。開く前に Escape で畳んだら、後から開き直さない */
  const cancelReveal = React.useRef(() => {})
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

  // 文脈が入ったら、聞く欄を開いて chip を見せる。選択を広げている途中で開くと手元が隠れるので、選択が落ち着いてから開く。
  // 入力欄へ focus は移さない（移すと頁の選択が外れる）。狭い画面の drawer は頁を覆うので、会話中は開かない
  React.useEffect(() => {
    if (!quote) return
    const reveal = () => {
      if (chat) {
        if (matchMedia(WIDE_QUERY).matches) setDrawer(true)
        return
      }
      anchor.current = window.scrollY
      setOpen(true)
    }
    // マウスで選択を広げている間は待ち、離したときに開く
    const onUp = () => reveal()
    const timer = setTimeout(() => {
      if (held.current) window.addEventListener('pointerup', onUp, { once: true })
      else reveal()
    }, QUOTE_OPEN_DELAY)
    const cancel = () => {
      clearTimeout(timer)
      window.removeEventListener('pointerup', onUp)
    }
    cancelReveal.current = cancel
    return cancel
  }, [quote, chat])

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
    cancelReveal.current()
    if (drawer) setDrawer(false)
    else setOpen(false)
  }, [drawer])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelReveal.current()
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
    const press = () => {
      mark()
      held.current = true
    }
    const release = () => (held.current = false)
    window.addEventListener('pointerdown', press, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('keydown', mark, true)
    return () => {
      window.removeEventListener('pointerdown', press, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
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

  // ×・背景・取っ手で閉じたら、文脈で開く予約も取り消す（Escape は close() で取り消す）
  const hideDrawer = () => {
    cancelReveal.current()
    setDrawer(false)
  }

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
    if (drag.current && drag.current.dy > DRAWER_DRAG_CLOSE) hideDrawer()
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
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><RobotIcon className="size-4 text-primary" aria-hidden="true" />{name}について</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Hint label="会話を別の頁で開く"><Link href={`/s/${chat.id}`} aria-label="会話を別の頁で開く" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><ArrowSquareOutIcon className="size-4" /></Link></Hint>
          <Hint label="新しい会話"><button type="button" onClick={restart} aria-label="新しい会話" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><NotePencilIcon className="size-4" /></button></Hint>
          <Hint label="閉じる（Esc）"><button type="button" onClick={hideDrawer} aria-label="閉じる" className="rounded-md p-2 hover:bg-secondary hover:text-foreground"><XIcon className="size-4" /></button></Hint>
        </div>
      </div>
    </div>
  ) : null

  const chip = quote ? (
    <div className="mb-2 flex min-w-0 max-w-full items-center gap-2 self-start rounded-full border bg-background py-1 pl-3 pr-1 text-[12.5px] text-muted-foreground shadow-sm">
      <QuotesIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate"><span className="sr-only">選んだ文: </span>{quote}</span>
      <button type="button" onClick={() => setQuote('')} aria-label="選んだ文を外す" className="shrink-0 rounded-full p-1 hover:bg-secondary hover:text-foreground"><XIcon className="size-3" /></button>
    </div>
  ) : null

  const docked = open && !chat
  return (
    <>
      <BackToTop hidden={docked || drawer} />
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
        <RobotIcon className="size-4 text-primary" aria-hidden="true" />
        {chat ? '会話に戻る' : `${name}について聞く`}
      </button>
      {chat ? (
        <>
          <div aria-hidden="true" onClick={hideDrawer} className={`fixed inset-0 z-30 bg-foreground/20 md:hidden transition-opacity duration-300 motion-reduce:transition-none ${drawer ? '' : 'pointer-events-none opacity-0'}`} />
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
