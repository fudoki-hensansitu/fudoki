// お金の流れ。初期は全款の款→項。横にスクロールすると款が一つずつ（snap）開き、縦にスクロールするとその款の項が一つずつ開く。
// 項まで開くと、その項の目と節の上位を出す（節の金額は目ごとに大きい順、足し上げは作らない）。
import * as React from 'react'
import { createPortal } from 'react-dom'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AmountTip, TIP_CARD, TipCard } from './amount-tip'
import { Overview, OverviewSkeleton } from './sankey'
import { formatShare, formatYen, type Drill, type FlowView, type Kou, type Moku, type PageData, type YearTotal } from './types'

/** 分け方ごとの段の呼び名。機能分類は COFOG の大分類・中分類のあとに自治体の科目（目）とその内訳（節・事業）が来る */
const LEVELS: Record<FlowView, { kan: string; kou: string; moku: string; setsu: string }> = {
  cofog: { kan: '大分類', kou: '中分類', moku: '科目', setsu: '内訳' },
  kan: { kan: '款', kou: '項', moku: '目', setsu: '節' },
}
type Levels = (typeof LEVELS)[FlowView]

const SETSU_SHOWN = 3
/** 帯の上を流れる光の幅と速さ（px、px/秒） */
const LIGHT = 140
const LIGHT_SPEED = 320
/** 目の側に立てる棒の幅。項の棒（w-2）と揃える */
const MOKU_BAR = 8
/** 節の側に立てる棒の幅 */
const SETSU_BAR = 5
/** 帯を描かない幅。項の段の並び（sm: で横並びになる）と同じ境目にする。ずれると、横並びなのに帯が出ない幅ができる */
const MOBILE_QUERY = '(max-width: 639.98px)'

const fetchJson = async <T,>(url: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

const amountText = (yen: number, missing?: boolean) => (missing ? '金額未記載' : formatYen(yen))
const share = (yen: number, max: number, missing?: boolean) => (missing || max <= 0 ? 0 : Math.min(100, (Math.max(0, yen) / max) * 100))

/** 節は目の内訳。上位だけ名前を出して残りは件数にまとめる。広い画面では目の棒から帯でつなぎ、狭い画面では目の金額に占める割合の横棒を出す */

/** kouYen は割合の基準（目は項に占める割合、節は目に占める割合）。金額と割合を並べて出す */
function MokuGroup({ moku, kouYen, levels, onMoku }: { moku: Moku; kouYen: number; levels: Levels; onMoku?: (m: Moku) => void }) {
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
        {onMoku ? (
          // 押すと事業と同じ詳細のパネルで目の中身（事業・節）を出す
          <button type="button" onClick={() => onMoku(moku)} className="group/moku -mx-1.5 grid w-[calc(100%+0.75rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary">
            <span className="text-sm leading-snug underline-offset-2 group-hover/moku:underline">{moku.name}</span>
            <CaretRightIcon className="row-span-2 size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs tabular-nums"><span className="font-semibold text-primary">{amountText(moku.yen, moku.amountMissing)}</span>{formatShare(moku.yen, kouYen, moku.amountMissing) ? <span className="ml-1.5 text-muted-foreground">{formatShare(moku.yen, kouYen, moku.amountMissing)}</span> : null}</span>
          </button>
        ) : (
          <AmountTip name={moku.name} yen={moku.yen} missing={moku.amountMissing} side="right" className="inline-grid outline-none">
            <span className="text-sm leading-snug">{moku.name}</span>
            <span className="text-xs tabular-nums"><span className="font-semibold text-primary">{amountText(moku.yen, moku.amountMissing)}</span>{formatShare(moku.yen, kouYen, moku.amountMissing) ? <span className="ml-1.5 text-muted-foreground">{formatShare(moku.yen, kouYen, moku.amountMissing)}</span> : null}</span>
          </AmountTip>
        )}
      </div>
      {top.length > 0 ? (
        <ul data-setsu-list className="grid min-w-0 gap-y-1 border-l pl-3 text-[12.5px] leading-snug sm:border-0 sm:pl-4" aria-label={`${moku.name}の${levels.setsu}`}>
          <li className="text-[11px] text-muted-foreground sm:hidden">{levels.setsu}</li>
          {top.map((s) => (
            <li key={s.name} data-setsu data-yen={s.amountMissing ? 0 : Math.max(0, s.yen)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5">
              <AmountTip name={`${moku.name}・${s.name}`} yen={s.yen} missing={s.amountMissing} side="right" className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 outline-none">
                <span className="truncate">{s.name}</span>
                <span className="text-right tabular-nums"><span className="font-semibold">{amountText(s.yen, s.amountMissing)}</span>{formatShare(s.yen, mokuYen, s.amountMissing) ? <span className="ml-1.5 text-muted-foreground">{formatShare(s.yen, mokuYen, s.amountMissing)}</span> : null}</span>
              </AmountTip>
              {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/5 sm:hidden">
                {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
                <span className="block h-full rounded-full bg-primary/55" style={{ width: `${share(s.yen, base, s.amountMissing)}%` }} />
              </span>
            </li>
          ))}
          {rest.length > 0 ? (
            <li data-setsu-rest className="text-[11.5px] text-muted-foreground">
              <Tooltip>
                <TooltipTrigger delay={100} className="grid w-full cursor-default! grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 text-left hover:text-foreground">
                  <span className="underline decoration-dotted underline-offset-2">ほか{rest.length}件</span>
                  {restYen !== null ? <span className="text-right tabular-nums">{amountText(restYen)}{formatShare(restYen, mokuYen) ? <span className="ml-1.5">{formatShare(restYen, mokuYen)}</span> : null}</span> : null}
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
function useEdgeFade(ref: React.RefObject<HTMLElement | null>, deps: React.DependencyList, off = false): React.CSSProperties {
  const [edge, setEdge] = React.useState({ top: false, bottom: false })
  React.useEffect(() => {
    const el = ref.current
    if (!el || off) return
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
  if (off) return {}
  // oxlint-disable-next-line design/color-literal -- mask は不透明度だけを使い、色は画面に出ない
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

function KouSection({ kou, active, loading, onBox, levels, onMoku }: { kou: Kou; active: boolean; loading: boolean; onBox: (el: HTMLElement | null) => void; levels: Levels; onMoku?: (m: Moku) => void }) {
  const box = React.useRef<HTMLElement | null>(null)
  const rib = React.useRef<HTMLDivElement>(null)
  const [paths, setPaths] = React.useState<Ribbon[]>([])
  const [setsu, setSetsu] = React.useState<Ribbon[]>([])
  const [bar, setBar] = React.useState({ top: 0, height: 0 })
  // 帯の上を流れる光（全体図と同じ）。動きを減らす設定では出さない
  const [still, setStill] = React.useState(true)
  React.useEffect(() => setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches), [])
  // 光が流れる右端。節の帯があればその先、無ければ目の棒まで
  const reach = Math.max(paths.at(0)?.x ?? 0, ...setsu.map((t) => t.x))
  const lightId = `flow-light${React.useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
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
    <section ref={(el) => { box.current = el; onBox(el) }} data-kou={kou.id} data-active={active} className="group/kou grid min-h-[calc(100%-7.5rem)] snap-start snap-always grid-cols-1 content-start gap-3 px-5 pb-5 pt-3 sm:grid-cols-[150px_10px_64px_minmax(0,1fr)] sm:gap-0 sm:pr-8">
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
          {/* 光は項の棒から目、節の帯まで一続きで左から右へ流れる（帯全体の座標で動かす。帯ごとの幅で動かすと段ごとに速さがずれて、流れて見えないため） */}
          {active && !still ? (
            <defs>
              <linearGradient id={lightId} gradientUnits="userSpaceOnUse" x1={-LIGHT} x2={0} y1={0} y2={0}>
                <stop offset="0" stopColor="var(--primary)" stopOpacity={0} />
                <stop offset="0.5" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
                <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to={`${reach + LIGHT} 0`} dur={`${((reach + LIGHT) / LIGHT_SPEED).toFixed(2)}s`} begin="1.4s" repeatCount="indefinite" />
              </linearGradient>
            </defs>
          ) : null}
          {/* 項が開いたら、中分類（項）→科目（目）→内訳（節）の順に帯が左から右へ伸びて流れ込む（全体図と同じ動き。styles/app.css）。帯は段ごとにまとめて一枚で伸ばす。閉じている項は出さない */}
          {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
          <g key={`r${active}`} className={active ? 'flow-ribbon' : 'opacity-0'}>{paths.map((p, i) => <path key={i} d={p.d} className="fill-primary/20" />)}</g>
          {active && !still ? paths.map((p, i) => <path key={`l${i}`} d={p.d} fill={`url(#${lightId})`} />) : null}
          {active && !still ? setsu.map((p, i) => <path key={`ls${i}`} d={p.d} fill={`url(#${lightId})`} />) : null}
          {paths.map((p, i) => <rect key={`b${active}${i}`} x={p.x} y={p.y} width={MOKU_BAR} height={p.h} rx={2} style={{ animationDelay: `${550 + Math.min(i * 15, 150)}ms` }} className={`fill-primary ${active ? 'flow-node' : 'opacity-0'}`} />)}
          {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
          <g key={`s${active}`} style={{ animationDelay: '450ms' }} className={active ? 'flow-ribbon' : 'opacity-0'}>{setsu.map((p, i) => <path key={i} d={p.d} className={p.rest ? 'fill-primary/10' : 'fill-primary/15'} />)}</g>
          {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
          {setsu.map((p, i) => <rect key={`t${active}${i}`} x={p.x} y={p.y} width={SETSU_BAR} height={p.h} rx={1.5} style={{ animationDelay: `${1000 + Math.min(i * 10, 150)}ms` }} className={`${p.rest ? 'fill-primary/35' : 'fill-primary/70'} ${active ? 'flow-node' : 'opacity-0'}`} />)}
        </svg>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:pl-2.5">
        {kou.moku.length > 0 ? (
          <div className="hidden grid-cols-[5fr_7fr] gap-4 text-[11px] text-muted-foreground sm:grid" aria-hidden="true">
            <span>{levels.moku}</span>
            <span className="pl-4">{levels.setsu}</span>
          </div>
        ) : null}
        {kou.moku.length > 0 ? kou.moku.map((m) => <MokuGroup key={m.id} moku={m} kouYen={kou.amountMissing ? 0 : kou.yen} levels={levels} onMoku={onMoku} />) : (
          <p className="text-[12.5px] text-muted-foreground" role={loading ? 'status' : undefined}>{loading ? '内訳を読み込んでいます…' : `この${levels.kou}に${levels.moku}はありません`}</p>
        )}
      </div>
    </section>
  )
}

/** natural は面の中で縦に送らず、中身の高さのまま頁のスクロールで読む */
function KanPanel({ drill, loading, levels, onMoku, natural, shown }: { drill: Drill; loading: boolean; levels: Levels; onMoku?: (m: Moku) => void; natural?: boolean; /** 横に並ぶ面のうち、今見せている面か */ shown?: boolean }) {
  const body = React.useRef<HTMLDivElement>(null)
  // natural のとき、面が画面に入っている間だけ目盛りを画面の右に固定して出す（track が横のスクロールの箱なので sticky は効かない）
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = body.current
    if (!natural || !el) return
    const observer = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { rootMargin: '-45% 0px -45% 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [natural])
  const [current, setCurrent] = React.useState(0)
  const sections = React.useRef<(HTMLElement | null)[]>([])
  React.useEffect(() => {
    const root = body.current
    if (!root) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(sections.current.indexOf(entry.target as HTMLElement))
    }, { root: natural ? null : root, rootMargin: '-35% 0px -55% 0px', threshold: 0 })
    for (const el of sections.current) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [drill.kou.length, natural])
  const fade = useEdgeFade(body, [drill.kou.length], natural)
  const toKou = (i: number) => {
    const root = body.current
    const el = sections.current[i]
    if (!root || !el) return
    // 上に貼り付くタブの帯と図の見出しの下に出す
    if (natural) return window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' })
    root.scrollTo({ top: el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop, behavior: 'smooth' })
  }
  const ticks = (
        <TickMenu
          label={`${drill.kan.name}の${levels.kou}へ移る`}
          side="left"
          current={current}
          onPick={toKou}
          items={drill.kou.map((k) => ({ key: k.id, name: k.name, note: amountText(k.yen, k.amountMissing) }))}
          className={natural ? 'fixed right-1 top-1/2 z-10 flex -translate-y-1/2 flex-col' : 'absolute right-0.5 top-1/2 z-10 flex -translate-y-1/2 flex-col'}
        >
          {drill.kou.map((k, i) => (
            <button key={k.id} type="button" onClick={() => toKou(i)} aria-label={k.name} aria-current={i === current || undefined} className="group/dot px-1.5 py-[3px]">
              {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
              <i className={`block w-[5px] rounded-full transition-all ${i === current ? 'h-4 bg-primary' : 'h-[5px] bg-border group-hover/dot:bg-primary/50'}`} />
            </button>
          ))}
        </TickMenu>
  )
  return (
    <div className={cn('relative w-full shrink-0 snap-start snap-always', !natural && 'h-full')} data-panel>
      {drill.kou.length > 1 && (!natural || (shown && inView)) ? (
        // 項の目盛り。押すとその項へ縦に送る。natural のときは画面の右の真ん中に固定する。
        // 祖先に transform（スマホのタブのカルーセル）があると fixed が画面に効かないので、body に出す
        natural ? createPortal(ticks, document.body) : ticks
      ) : null}
      <div ref={body} style={fade} className={natural ? '' : 'h-full snap-y snap-proximity scroll-pt-10 overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'} tabIndex={-1}>
        {drill.kou.map((k, i) => (
          <KouSection key={k.id} kou={k} active={i === current} loading={loading} levels={levels} onMoku={onMoku} onBox={(el) => { sections.current[i] = el }} />
        ))}
        {/* 下端にも止まる所を置く。最後の段の頭にしか止まれないと、下端まで送れず頁のスクロールにも渡らない */}
        {natural ? null : <div aria-hidden="true" className="h-px snap-end" />}
      </div>
    </div>
  )
}

/** 款→項の全体図と款ごとの内訳。最新年度の款→項はページに埋めてあり、それ以外の年度は図が近づいたら読み込む */
/** tabs はカードの左上に置く切り替え（分け方）、summary は全体図のときに出す総額。view は分野（COFOG の枠）か款か */
export function Flow({ data, total: year, view = 'kan', phase = 'settlement', tabs, summary, className, bare, onMoku, account, natural }: { data: PageData; total: YearTotal; view?: FlowView; /** 決算の無い年度は当初予算（initial）の流れを読む */ phase?: 'settlement' | 'initial'; tabs?: React.ReactNode; summary?: React.ReactNode; /** 図の高さなど、置き場ごとに変える枠の class */ className?: string; /** 枠（カード）を付けず、置き場の幅いっぱいに出す */ bare?: boolean; /** 目を押したときに詳細を開く。無ければ金額をツールチップで見せるだけ */ onMoku?: (m: Moku) => void; /** 特別会計の流れを読むときの会計の名前。無ければ一般会計 */ account?: string; /** 図の高さを画面に合わせて決めず、中身の高さで伸ばして頁のスクロールで読む */ natural?: boolean }) {
  const levels = LEVELS[view]
  // 頁に埋めてある最新の決算の流れは一般会計のものだけ
  const isLatest = !account && phase === 'settlement' && year.year === data.years.at(-1)?.year
  const root = React.useRef<HTMLDivElement>(null)
  const track = React.useRef<HTMLDivElement>(null)
  const overview = React.useRef<HTMLDivElement>(null)
  const [detail, setDetail] = React.useState<Drill[]>()
  const [error, setError] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  // natural（自治体の頁のタブ）では図は開いたタブの中にあるので、近づくのを待たずにすぐ読む
  const [near, setNear] = React.useState(!!natural)
  const [index, setIndex] = React.useState(0)
  const flows = detail ?? (isLatest ? (view === 'cofog' ? data.cofogFlow : data.flow) : [])
  const overviewFade = useEdgeFade(overview, [flows.length], natural)
  // natural のときは、横に並ぶ面のうち今の面の高さに枠を合わせる（ほかの面の高さで下が空かないように）
  const [trackHeight, setTrackHeight] = React.useState<number>()
  React.useEffect(() => {
    const el = track.current
    if (!natural || !el) return
    const panels = [...el.children] as HTMLElement[]
    const measure = () => setTrackHeight(panels[index]?.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    for (const p of panels) observer.observe(p)
    return () => observer.disconnect()
  }, [natural, index, flows.length])
  // 項の内訳（目・節）は、図が近づいたら読み込む。クリックは要らない
  React.useEffect(() => {
    const el = root.current
    if (!el || near) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true) }, { rootMargin: '900px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])
  React.useEffect(() => {
    if (!near || detail) return
    setError(false)
    const controller = new AbortController()
    const url = `/api/jurisdictions/flow/${data.code}/${year.year}/setsu?${new URLSearchParams({ ...(view === 'cofog' ? { view: 'cofog' } : {}), ...(phase === 'initial' ? { phase: 'initial' } : {}), ...(account ? { account } : {}) })}`
    fetchJson<Drill[]>(url, controller.signal).then(
      (value) => {
        if (controller.signal.aborted) return
        // 空の流れは読み込み中の形のまま残さず、読めなかったものとして扱う
        if (value.length > 0) setDetail(value)
        else setError(true)
      },
      () => { if (!controller.signal.aborted) setError(true) },
    )
    return () => controller.abort()
  }, [near, detail, data.code, year.year, view, phase, account, attempt])
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
    if (natural) {
      if (section) window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 120, behavior: 'instant' })
      el.focus({ preventScroll: true })
      return
    }
    const top = section ? section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop : 0
    body.scrollTo({ top, behavior: 'instant' })
    el.focus({ preventScroll: true })
  }
  const goTo = (i: number) => track.current?.scrollTo({ left: i * (track.current?.clientWidth ?? 0), behavior: 'smooth' })
  const go = (delta: number) => track.current?.scrollBy({ left: delta * (track.current?.clientWidth ?? 0), behavior: 'smooth' })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { go(1); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault() }
  }
  const total = flows.length
  const overviewHeight = Math.min(560, typeof window === 'undefined' ? 520 : Math.max(380, window.innerHeight * 0.7))
  const kan = index > 0 ? flows[index - 1] : undefined
  const sum = flows.reduce((s, f) => s + Math.max(0, f.kan.yen), 0) || 1
  return (
    <div ref={root} className={cn('flex min-w-0 scroll-mt-[122px] flex-col rounded-[20px] border bg-background @4xl:scroll-mt-[77px]', !natural && 'h-[calc(100svh-61px-53px-1.5rem)] min-h-[480px] @4xl:h-[calc(100svh-61px-2rem)]', bare && 'rounded-none border-0', className)}>
      <div className={cn('shrink-0', bare ? 'pt-1' : 'px-5 pt-5 sm:px-6')}>
        {tabs}
        {/* 見出しと金額の行。右に今いる段（大分類 4 / 8）と前後の矢印を置く */}
        <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
          {/* 名前と金額の置き方を段ごとに変えない（名前の長さで折り返すと、横に送るたびに金額の位置と行の高さが動いて見える）。スマホは名前の下に金額、広い画面は横に並べる */}
          <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-x-3" aria-live="polite">
            {kan ? (
              <>
                <span className="min-w-0 truncate text-sm text-muted-foreground">{kan.kan.name}</span>
                <b className="shrink-0 text-[26px] font-normal leading-snug tabular-nums">{amountText(kan.kan.yen, kan.kan.amountMissing)}</b>
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
            {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
            <i className={`block h-1.5 rounded-sm transition-colors ${index === 0 ? 'bg-primary' : 'bg-border group-hover/seg:bg-primary/40'}`} />
          </button>
          {flows.map((f, i) => (
            <button key={f.kan.id} type="button" onClick={() => goTo(i + 1)} aria-label={f.kan.name} aria-current={index === i + 1 || undefined} className="group/seg min-w-[3px] py-1" style={{ flexGrow: Math.max(f.kan.yen, 0) / sum || 0.01, flexBasis: 0 }}>
              {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
              <i className={`block h-1.5 rounded-sm transition-colors ${index === i + 1 ? 'bg-primary' : 'bg-border group-hover/seg:bg-primary/40'}`} />
            </button>
          ))}
        </TickMenu>
        <p className="mt-2 text-xs text-muted-foreground">
          {index > 0 ? natural ? null : <>縦にスクロールすると、{levels.kan}の中の{levels.kou}が一つずつ開きます。{index < total ? `横で次の${levels.kan}へ。` : null}</> : '横にスクロールすると、詳細が開きます。'}
        </p>
      </div>
      <div className={cn('relative mt-2', !natural && 'min-h-0 flex-1')}>
        <div
          ref={track}
          role="region"
          aria-label={`お金の流れ（横にスクロールで${levels.kan}を切り替え）`}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKey}
          style={natural ? { height: trackHeight } : undefined}
          className={cn('flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth rounded-b-[20px] [scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-scrollbar]:hidden', natural ? 'items-start transition-[height] duration-300' : 'h-full')}
        >
          <div ref={overview} style={overviewFade} className={cn('w-full shrink-0 snap-start snap-always pb-3 pt-2', !natural && 'h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', !bare && 'px-3 sm:px-5')}>
            {flows.length > 0 ? (
              <Overview flows={flows} total={year.yen} levels={levels} onSelect={select} height={overviewHeight} />
            ) : (
              error ? null : <OverviewSkeleton total={year.yen} levels={levels} height={overviewHeight} />
            )}
          </div>
          {flows.map((f, i) => <KanPanel key={f.kan.id} drill={f} loading={!detail && !error} levels={levels} onMoku={onMoku} natural={natural} shown={index === i + 1} />)}
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
