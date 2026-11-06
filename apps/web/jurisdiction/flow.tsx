// お金の流れ。初期は全款の款→項。横にスクロールすると款が一つずつ（snap）開き、縦にスクロールするとその款の項が一つずつ開く。
// 項まで開くと、その項の目と節の上位を出す（節の金額は目ごとに大きい順、足し上げは作らない）。
import * as React from 'react'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AmountTip, TIP_CARD, TipCard } from './amount-tip'
import { Overview } from './sankey'
import { formatShare, formatYen, type Drill, type FlowView, type Kou, type Moku, type PageData, type YearTotal } from './types'

/** 分け方ごとの段の呼び名。機能分類は COFOG の大分類・中分類のあとに自治体の科目（目）とその内訳（節・事業）が来る */
const LEVELS: Record<FlowView, { kan: string; kou: string; moku: string; setsu: string }> = {
  cofog: { kan: '大分類', kou: '中分類', moku: '科目', setsu: '内訳' },
  kan: { kan: '款', kou: '項', moku: '目', setsu: '節' },
}
type Levels = (typeof LEVELS)[FlowView]

const SETSU_SHOWN = 3
/** 目の側に立てる棒の幅。項の棒（w-2）と揃える */
const MOKU_BAR = 8
/** 節の側に立てる棒の幅 */
const SETSU_BAR = 5
const MOBILE_QUERY = '(max-width: 699px)'

const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

const amountText = (yen: number, missing?: boolean) => (missing ? '金額未記載' : formatYen(yen))
const share = (yen: number, max: number, missing?: boolean) => (missing || max <= 0 ? 0 : Math.min(100, (Math.max(0, yen) / max) * 100))

/** 節は目の内訳。上位だけ名前を出して残りは件数にまとめる。広い画面では目の棒から帯でつなぎ、狭い画面では目の金額に占める割合の横棒を出す */
/** 割合のラベル。基準が無い（金額未記載）ときは金額のまま出す */
const pctOr = (yen: number, base: number, missing?: boolean) => formatShare(yen, base, missing) ?? amountText(yen, missing)

/** kouYen は割合の基準（目は項に占める割合、節は目に占める割合）。金額はツールチップで見せる */
function MokuGroup({ moku, kouYen, levels }: { moku: Moku; kouYen: number; levels: Levels }) {
  const shown = moku.setsu.filter((s) => s.amountMissing || s.yen > 0)
  const top = shown.slice(0, SETSU_SHOWN)
  const rest = shown.slice(SETSU_SHOWN)
  // 残りの節の合計。同じ目の同じ軸（節、無ければ備考）の末端どうしなので足してよい（api の sum_rules）。金額未記載が混じるときは出さない
  const restYen = rest.some((s) => s.amountMissing) ? null : rest.reduce((a, s) => a + s.yen, 0)
  // 目の金額が印字されていないときは、一番大きい節を基準にして大小だけ見せる
  const base = moku.amountMissing ? Math.max(0, ...top.filter((s) => !s.amountMissing).map((s) => s.yen)) : moku.yen
  // 割合は目の金額が印字されているときだけ。無いときは節の金額をそのまま出す
  const mokuYen = moku.amountMissing ? 0 : moku.yen
  return (
    <div data-moku data-yen={moku.amountMissing ? 0 : moku.yen} className="grid translate-y-1.5 grid-cols-1 items-start gap-1.5 opacity-30 transition-[opacity,transform] duration-500 group-data-[active=true]/kou:translate-y-0 group-data-[active=true]/kou:opacity-100 sm:grid-cols-[5fr_7fr] sm:gap-4">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground sm:hidden">{levels.moku}</div>
        <AmountTip name={moku.name} yen={moku.yen} missing={moku.amountMissing} side="right" className="inline-grid outline-none">
          <span className="text-sm leading-snug">{moku.name}</span>
          <span className="text-xs font-semibold tabular-nums text-primary">{pctOr(moku.yen, kouYen, moku.amountMissing)}</span>
        </AmountTip>
      </div>
      {top.length > 0 ? (
        <ul data-setsu-list className="grid min-w-0 gap-y-1 border-l pl-3 text-[12.5px] leading-snug sm:border-0 sm:pl-4" aria-label={`${moku.name}の${levels.setsu}`}>
          <li className="text-[11px] text-muted-foreground sm:hidden">{levels.setsu}</li>
          {top.map((s) => (
            <li key={s.name} data-setsu data-yen={s.amountMissing ? 0 : Math.max(0, s.yen)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5">
              <AmountTip name={`${moku.name}・${s.name}`} yen={s.yen} missing={s.amountMissing} side="right" className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 outline-none">
                <span className="truncate">{s.name}</span>
                <span className="text-right font-semibold tabular-nums text-primary">{pctOr(s.yen, mokuYen, s.amountMissing)}</span>
              </AmountTip>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/5 sm:hidden">
                <span className="block h-full rounded-full bg-primary/55" style={{ width: `${share(s.yen, base, s.amountMissing)}%` }} />
              </span>
            </li>
          ))}
          {rest.length > 0 ? (
            <li data-setsu-rest className="text-[11.5px] text-muted-foreground">
              <Tooltip>
                <TooltipTrigger delay={100} className="grid w-full cursor-default! grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 text-left hover:text-foreground">
                  <span className="underline decoration-dotted underline-offset-2">ほか{rest.length}件</span>
                  {restYen !== null ? <span className="text-right tabular-nums">{pctOr(restYen, mokuYen)}</span> : null}
                </TooltipTrigger>
                <TooltipContent side="right" className={`block max-w-72 ${TIP_CARD}`}>
                  {restYen !== null ? <div className="mb-1.5"><TipCard name={`ほか${rest.length}件`} yen={restYen} /></div> : null}
                  <ul className="grid gap-y-0.5 text-xs">
                    {rest.map((s) => (
                      <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                        <span className="truncate">{s.name}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{amountText(s.yen, s.amountMissing)}</span>
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="border-l pl-3 text-[12.5px] text-muted-foreground">内訳の区分は出典にありません</p>
      )}
    </div>
  )
}

/** 縦にスクロールする面で、上や下にまだ続きがあるか。続きがある側を fade にして、前後の要素が少し見えるようにする */
function useEdgeFade(ref: React.RefObject<HTMLElement | null>, deps: React.DependencyList): React.CSSProperties {
  const [edge, setEdge] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const top = el.scrollTop > 2
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2
      setEdge((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }))
    }
    update()
    // 上端・下端でさらに回したら、箱の中で止めずに頁を送る（snap や跳ね返りで頁のスクロールに移らないことがあるため）
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const atTop = el.scrollTop <= 1
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if (!((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom))) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      window.scrollBy({ top: e.deltaY * unit, behavior: 'instant' })
    }
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => { el.removeEventListener('scroll', update); el.removeEventListener('wheel', onWheel); observer.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  const mask = `linear-gradient(to bottom, ${edge.top ? 'transparent 0, #000 48px' : '#000 0'}, ${edge.bottom ? '#000 calc(100% - 72px), transparent 100%' : '#000 100%'})`
  return { maskImage: mask, WebkitMaskImage: mask }
}

interface Ribbon { d: string; x: number; y: number; h: number; rest?: boolean }
/** x0 の y0 から太さ h0 で出て、x1 の y1 に太さ h1 で着く帯 */
const band = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => {
  const m = (x0 + x1) / 2
  return `M${x0} ${y0}C${m} ${y0},${m} ${y1},${x1} ${y1}L${x1} ${y1 + h1}C${m} ${y1 + h1},${m} ${y0 + h0},${x0} ${y0 + h0}Z`
}

/** 項の帯を目の行へ、目の帯を上位の節へ渡す。狭い画面では出さない */
/** 款・項の目盛り。hover すると一覧を tooltip に出し、押すとそこへ移る（目盛り自体もボタンで、キーボードはそちらで動かす） */
function TickMenu({ items, current, onPick, side, label, className, children }: {
  items: { key: string; name: string; note?: string }[]
  current: number
  onPick: (i: number) => void
  side: 'bottom' | 'left'
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<div role="group" aria-label={label} className={className} />}>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="block max-h-[min(60vh,420px)] w-60 overflow-y-auto rounded-xl p-1.5 shadow-lg">
        <ul className="grid gap-px">
          {items.map((item, i) => (
            <li key={item.key}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onPick(i)}
                data-current={i === current || undefined}
                // 左の目次と同じ見た目（いまの所は地の色と左の縦線）
                className="relative flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-card hover:text-foreground data-[current]:bg-card data-[current]:text-foreground data-[current]:before:absolute data-[current]:before:inset-y-1.5 data-[current]:before:left-0 data-[current]:before:w-[3px] data-[current]:before:rounded-sm data-[current]:before:bg-primary"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                {item.note ? <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{item.note}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function KouSection({ kou, active, loading, onBox, levels }: { kou: Kou; active: boolean; loading: boolean; onBox: (el: HTMLElement | null) => void; levels: Levels }) {
  const box = React.useRef<HTMLElement | null>(null)
  const rib = React.useRef<HTMLDivElement>(null)
  const [paths, setPaths] = React.useState<Ribbon[]>([])
  const [setsu, setSetsu] = React.useState<Ribbon[]>([])
  const [bar, setBar] = React.useState({ top: 0, height: 0 })
  React.useLayoutEffect(() => {
    const el = box.current
    const lane = rib.current
    if (!el || !lane) return
    const measure = () => {
      if (window.matchMedia(MOBILE_QUERY).matches) { setSetsu([]); return setPaths([]) }
      const rows = [...el.querySelectorAll<HTMLElement>('[data-moku]')]
      if (rows.length === 0) return setPaths([])
      const origin = lane.getBoundingClientRect().top
      const boxes = rows.map((row) => row.getBoundingClientRect())
      const yen = rows.map((row) => Number(row.dataset.yen))
      const sum = yen.reduce((s, v) => s + v, 0)
      const shares = yen.map((v) => (sum > 0 ? v / sum : 1 / rows.length))
      // 帯は両端で同じ太さ（全体図と同じ読み方）。目の棒が次の目の行に重ならない太さまで縮める
      const slots = boxes.map((r, i) => (boxes[i + 1] ? boxes[i + 1]!.top - r.top - 6 : r.height))
      const scale = Math.max(Math.min(boxes.at(-1)!.bottom - boxes[0]!.top, ...shares.map((v, i) => (v > 0 ? slots[i]! / v : Infinity))), 24)
      const lanebox = lane.getBoundingClientRect()
      const width = lanebox.width
      const end = width - MOKU_BAR
      const top = boxes[0]!.top - origin
      let y = top
      const next: Ribbon[] = []
      const twigs: Ribbon[] = []
      boxes.forEach((r, i) => {
        const h = Math.max(shares[i]! * scale, 2)
        const ty = r.top - origin
        next.push({ d: band(0, y, h, end, ty, h), x: end, y: ty, h })
        y += h
        // 目の棒から上位の節へ。節の棒は目の金額に占める割合で、節の行に重ならない太さまで縮める
        const list = rows[i]!.querySelector<HTMLElement>('[data-setsu-list]')
        const items = list ? [...list.querySelectorAll<HTMLElement>('[data-setsu]')] : []
        if (!list || items.length === 0 || yen[i]! <= 0) return
        const x = list.getBoundingClientRect().left - lanebox.left
        // 「ほか○節」には、目の棒のうち上位の節が使わなかった残りの太さで帯を渡す（金額は足し上げない）
        const restRow = list.querySelector<HTMLElement>('[data-setsu-rest]')
        const topParts = items.map((li) => Math.min(1, Number(li.dataset.yen) / yen[i]!))
        const restPart = Math.max(0, 1 - topParts.reduce((a, v) => a + v, 0))
        const rows2 = restRow && restPart > 0 ? [...items, restRow] : items
        const rects = rows2.map((li) => li.getBoundingClientRect())
        const parts = restRow && restPart > 0 ? [...topParts, restPart] : topParts
        const gaps = rects.map((b, j) => (rects[j + 1] ? rects[j + 1]!.top - b.top - 3 : b.height))
        // 帯は目の棒と同じ縮尺（項の中で共通）で両端を同じ太さにする。目ごとに縮尺を変えると、同じ金額でも目によって太さが違って見える。
        // 節の行の高さを超える分だけ、節の側で行の高さに収める
        let from = ty
        rects.forEach((b, j) => {
          const sh = Math.max(parts[j]! * h, 1)
          const th = Math.min(Math.max(sh, 2), gaps[j]!)
          twigs.push({ d: band(width, from, sh, x, b.top - origin, th), x, y: b.top - origin, h: th, rest: rows2[j] === restRow })
          from += sh
        })
      })
      setBar({ top, height: y - top })
      setPaths(next)
      setSetsu(twigs)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // 目の行は開くときに少し動くので、動き終わってから測り直す
    const settle = window.setTimeout(measure, 550)
    return () => { observer.disconnect(); window.clearTimeout(settle) }
  }, [kou.moku.length, active])
  return (
    <section ref={(el) => { box.current = el; onBox(el) }} data-kou={kou.id} data-active={active} data-ask-view={active ? `${kou.name}（${levels.kou}）の${levels.moku}と${levels.setsu}` : undefined} className="group/kou grid min-h-[calc(100%-7.5rem)] snap-start snap-always grid-cols-1 content-start gap-3 px-5 pb-5 pt-3 sm:grid-cols-[150px_10px_64px_minmax(0,1fr)] sm:gap-0 sm:pr-8">
      <div className="min-w-0 border-b pb-2 sm:border-0 sm:pb-0 sm:pr-2">
        <div className="text-[11px] text-muted-foreground">{levels.kou}</div>
        <div className="font-sans text-lg leading-snug">{kou.name}</div>
        <div className="text-[13px] tabular-nums text-muted-foreground">{amountText(kou.yen, kou.amountMissing)}</div>
      </div>
      <div className="relative hidden sm:block" aria-hidden="true">
        <i className="absolute left-0 w-2 rounded-sm bg-primary transition-[height] duration-500" style={{ top: bar.top, height: bar.height }} />
      </div>
      <div ref={rib} className="relative hidden sm:block" aria-hidden="true">
        <svg className="absolute inset-0 size-full overflow-visible">
          {paths.map((p, i) => <path key={i} d={p.d} className={`fill-primary/20 transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`} />)}
          {setsu.map((p, i) => <path key={`s${i}`} d={p.d} className={`${p.rest ? 'fill-primary/10' : 'fill-primary/15'} transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`} />)}
          {setsu.map((p, i) => <rect key={`t${i}`} x={p.x} y={p.y} width={SETSU_BAR} height={p.h} rx={1.5} className={`${p.rest ? 'fill-primary/35' : 'fill-primary/70'} transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`} />)}
          {paths.map((p, i) => <rect key={`b${i}`} x={p.x} y={p.y} width={MOKU_BAR} height={p.h} rx={2} className={`fill-primary transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`} />)}
        </svg>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:pl-2.5">
        {kou.moku.length > 0 ? (
          <div className="hidden grid-cols-[5fr_7fr] gap-4 text-[11px] text-muted-foreground sm:grid" aria-hidden="true">
            <span>{levels.moku}</span>
            <span className="pl-4">{levels.setsu}</span>
          </div>
        ) : null}
        {kou.moku.length > 0 ? kou.moku.map((m) => <MokuGroup key={m.id} moku={m} kouYen={kou.amountMissing ? 0 : kou.yen} levels={levels} />) : (
          <p className="text-[12.5px] text-muted-foreground" role={loading ? 'status' : undefined}>{loading ? '内訳を読み込んでいます…' : `この${levels.kou}に${levels.moku}はありません`}</p>
        )}
      </div>
    </section>
  )
}

function KanPanel({ drill, loading, levels }: { drill: Drill; loading: boolean; levels: Levels }) {
  const body = React.useRef<HTMLDivElement>(null)
  const [current, setCurrent] = React.useState(0)
  const sections = React.useRef<(HTMLElement | null)[]>([])
  React.useEffect(() => {
    const root = body.current
    if (!root) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(sections.current.indexOf(entry.target as HTMLElement))
    }, { root, rootMargin: '-35% 0px -55% 0px', threshold: 0 })
    for (const el of sections.current) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [drill.kou.length])
  const fade = useEdgeFade(body, [drill.kou.length])
  const toKou = (i: number) => {
    const root = body.current
    const el = sections.current[i]
    if (!root || !el) return
    root.scrollTo({ top: el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop, behavior: 'smooth' })
  }
  return (
    <div className="relative h-full w-full shrink-0 snap-start snap-always" data-panel>
      {drill.kou.length > 1 ? (
        // 項の目盛り。押すとその項へ縦に送る
        <TickMenu
          label={`${drill.kan.name}の${levels.kou}へ移る`}
          side="left"
          current={current}
          onPick={toKou}
          items={drill.kou.map((k) => ({ key: k.id, name: k.name, note: amountText(k.yen, k.amountMissing) }))}
          className="absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 flex-col"
        >
          {drill.kou.map((k, i) => (
            <button key={k.id} type="button" onClick={() => toKou(i)} aria-label={k.name} aria-current={i === current || undefined} className="group/dot px-1.5 py-[3px]">
              <i className={`block w-[5px] rounded-full transition-all ${i === current ? 'h-4 bg-primary' : 'h-[5px] bg-border group-hover/dot:bg-primary/50'}`} />
            </button>
          ))}
        </TickMenu>
      ) : null}
      <div ref={body} style={fade} className="h-full snap-y snap-proximity scroll-pt-10 overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" tabIndex={-1}>
        {drill.kou.map((k, i) => (
          <KouSection key={k.id} kou={k} active={i === current} loading={loading} levels={levels} onBox={(el) => { sections.current[i] = el }} />
        ))}
        {/* 下端にも止まる所を置く。最後の段の頭にしか止まれないと、下端まで送れず頁のスクロールにも渡らない */}
        <div aria-hidden="true" className="h-px snap-end" />
      </div>
    </div>
  )
}

/** 款→項の全体図と款ごとの内訳。最新年度の款→項はページに埋めてあり、それ以外の年度は図が近づいたら読み込む */
/** tabs はカードの左上に置く切り替え（決算／予算・分け方）、summary は全体図のときに出す総額。view は分野（COFOG の枠）か款か */
export function Flow({ data, total: year, view = 'kan', tabs, summary, open, onOpened }: { data: PageData; total: YearTotal; view?: FlowView; tabs?: React.ReactNode; summary?: React.ReactNode; open?: { id: string; n: number }; onOpened?: () => void }) {
  const levels = LEVELS[view]
  const isLatest = year.year === data.years.at(-1)?.year
  const root = React.useRef<HTMLDivElement>(null)
  const track = React.useRef<HTMLDivElement>(null)
  const overview = React.useRef<HTMLDivElement>(null)
  const [detail, setDetail] = React.useState<Drill[]>()
  const [error, setError] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [near, setNear] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const flows = detail ?? (isLatest ? (view === 'cofog' ? data.cofogFlow : data.flow) : [])
  const overviewFade = useEdgeFade(overview, [flows.length])
  // 項の内訳（目・節）は、図が近づいたら読み込む。クリックは要らない
  React.useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true) }, { rootMargin: '900px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    if (!near || detail) return
    setError(false)
    const controller = new AbortController()
    fetchJson<Drill[]>(`/api/jurisdictions/flow/${data.code}/${year.year}/setsu${view === 'cofog' ? '?view=cofog' : ''}`, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setDetail(value) },
      () => { if (!controller.signal.aborted) setError(true) },
    )
    return () => controller.abort()
  }, [near, detail, data.code, year.year, view, attempt])
  const onScroll = () => {
    const el = track.current
    if (!el) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    setIndex((prev) => (prev === next ? prev : next))
  }
  // 全体図で押した款の面へ移り、項を押したときはその項まで縦に送る
  const select = (kanIndex: number, kouIndex?: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: (kanIndex + 1) * el.clientWidth, behavior: 'smooth' })
    const panel = el.querySelectorAll<HTMLElement>('[data-panel]')[kanIndex]
    const body = panel?.lastElementChild as HTMLElement | null
    const section = kouIndex === undefined ? undefined : body?.querySelectorAll<HTMLElement>('[data-kou]')[kouIndex]
    if (!body) return
    const top = section ? section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop : 0
    body.scrollTo({ top, behavior: 'instant' })
    el.focus({ preventScroll: true })
  }
  // 外から開く大分類を指定されたら、図まで縦に送ってその面へ移る
  // 一度開いたら onOpened で取り消してもらい、年度を変えて作り直したときに再び動かないようにする
  const scrolled = React.useRef<number>(undefined)
  React.useEffect(() => {
    if (!open) return
    if (scrolled.current !== open.n) { root.current?.scrollIntoView({ behavior: 'smooth' }); scrolled.current = open.n }
    if (error) { onOpened?.(); return }
    if (!flows.length) return
    const i = flows.findIndex((f) => f.kan.id === open.id)
    if (i >= 0) select(i)
    onOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flows.length, error])
  const goTo = (i: number) => track.current?.scrollTo({ left: i * (track.current?.clientWidth ?? 0), behavior: 'smooth' })
  const go = (delta: number) => track.current?.scrollBy({ left: delta * (track.current?.clientWidth ?? 0), behavior: 'smooth' })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { go(1); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault() }
  }
  const total = flows.length
  const kan = index > 0 ? flows[index - 1] : undefined
  const sum = flows.reduce((s, f) => s + Math.max(0, f.kan.yen), 0) || 1
  return (
    <div ref={root} data-ask-view={kan ? `${kan.kan.name}（${levels.kan}）の内訳` : `${levels.kan}から${levels.kou}への全体図`} className="flex h-[calc(100svh-61px-53px-1.5rem)] min-h-[480px] min-w-0 scroll-mt-[122px] flex-col rounded-[20px] border bg-background lg:h-[calc(100svh-61px-2rem)] lg:scroll-mt-[77px]">
      <div className="shrink-0 px-5 pt-5 sm:px-6">
        {tabs}
        {/* 見出しと金額の行。右に今いる段（大分類 4 / 8）と前後の矢印を置く */}
        <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3" aria-live="polite">
            {kan ? (
              <>
                <span className="text-sm text-muted-foreground">{kan.kan.name}</span>
                <b className="text-[26px] font-normal leading-snug tabular-nums">{amountText(kan.kan.yen, kan.kan.amountMissing)}</b>
              </>
            ) : summary}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs tabular-nums text-muted-foreground">{kan ? `${levels.kan} ${index} / ${total}` : ''}</span>
            <Button variant="outline" size="icon-sm" aria-label={`前の${levels.kan}`} disabled={index === 0} onClick={() => go(-1)} className="rounded-full [@media(hover:none)]:hidden"><CaretLeftIcon /></Button>
            <Button variant="outline" size="icon-sm" aria-label={`次の${levels.kan}`} disabled={index >= total} onClick={() => go(1)} className="rounded-full [@media(hover:none)]:hidden"><CaretRightIcon /></Button>
          </div>
        </div>
        {/* 款の目盛り。押すとその款（先頭は全体図）へ移る。押せる高さを取り、見える棒は細いまま */}
        <TickMenu
          label={`${levels.kan}へ移る`}
          side="bottom"
          current={index}
          onPick={goTo}
          items={[{ key: 'overview', name: '全体', note: formatYen(year.yen) }, ...flows.map((f) => ({ key: f.kan.id, name: f.kan.name, note: amountText(f.kan.yen, f.kan.amountMissing) }))]}
          className="mt-1 flex gap-0.5"
        >
          <button type="button" onClick={() => goTo(0)} aria-label="全体" aria-current={index === 0 || undefined} className="group/seg w-3.5 py-1">
            <i className={`block h-1.5 rounded-sm transition-colors ${index === 0 ? 'bg-primary' : 'bg-border group-hover/seg:bg-primary/40'}`} />
          </button>
          {flows.map((f, i) => (
            <button key={f.kan.id} type="button" onClick={() => goTo(i + 1)} aria-label={f.kan.name} aria-current={index === i + 1 || undefined} className="group/seg min-w-[3px] py-1" style={{ flexGrow: Math.max(f.kan.yen, 0) / sum || 0.01, flexBasis: 0 }}>
              <i className={`block h-1.5 rounded-sm transition-colors ${index === i + 1 ? 'bg-primary' : 'bg-border group-hover/seg:bg-primary/40'}`} />
            </button>
          ))}
        </TickMenu>
        <p className="mt-2 text-xs text-muted-foreground">
          {index > 0 ? <>縦にスクロールすると、{levels.kan}の中の{levels.kou}が一つずつ開きます。{index < total ? `横で次の${levels.kan}へ。` : null}</> : '横にスクロールすると、詳細が開きます。'}
        </p>
      </div>
      <div className="relative mt-2 min-h-0 flex-1">
        <div
          ref={track}
          role="region"
          aria-label={`お金の流れ（横にスクロールで${levels.kan}を切り替え）`}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKey}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth rounded-b-[20px] [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-scrollbar]:hidden"
        >
          <div ref={overview} style={overviewFade} className="h-full w-full shrink-0 snap-start snap-always overflow-y-auto px-3 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5">
            {flows.length > 0 ? (
              <Overview flows={flows} total={year.yen} levels={levels} onSelect={select} height={Math.min(560, typeof window === 'undefined' ? 520 : Math.max(380, window.innerHeight * 0.7))} />
            ) : (
              <p className="grid h-full place-items-center text-sm text-muted-foreground" role={error ? undefined : 'status'}>{error ? '' : 'お金の流れを読み込んでいます…'}</p>
            )}
          </div>
          {flows.map((f) => <KanPanel key={f.kan.id} drill={f} loading={!detail && !error} levels={levels} />)}
        </div>
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 px-5 pb-4 text-sm text-destructive">
          <p>内訳を読み込めませんでした。</p>
          <Button variant="outline" onClick={() => { setDetail(undefined); setAttempt((n) => n + 1) }}>もう一度読み込む</Button>
        </div>
      ) : null}
    </div>
  )
}
