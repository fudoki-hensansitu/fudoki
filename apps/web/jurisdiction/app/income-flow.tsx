// 予算・決算のタブの頭の「入る→使う」。一般会計の歳入（款）と歳出（使い道の分野）の総額・1人あたりと、両者を一般会計でつなぐ流れの図。
// 図の寸法・割合の置き方・帯の濃さはお金の流れ（sankey.tsx）に揃え、入るは金茶、使うは緑で分ける。入るは款で分ける
import * as React from 'react'
import { cn } from '@/lib/utils'
import { AmountTip } from '../amount-tip'
import { useFlowSeen } from '../sankey'
import { formatShare, type RevenueDoc } from '../types'
import { Amt } from './amount'

const BAR = 8
const LEAD = 13
const GAP = 14
const HEAD = 20
const IN_SLOT = 30
const OUT_SLOT = 26

export type Tone = 'in' | 'out' | 'rest'
export type Node = { id: string; label: string; yen: number; tone: Tone; base?: number; onClick?: () => void }

const BAR_FILL: Record<Tone, string> = { in: 'fill-(--kincha)', out: 'fill-primary', rest: 'fill-muted-foreground' }
// oxlint-disable-next-line design/color-opacity -- お金の流れ（sankey.tsx）の帯と同じ濃さに揃える。あちらの例外を決めるときに一緒に直す
const RIBBON_FILL: Record<Tone, string> = { in: 'fill-(--kincha)/30', out: 'fill-primary/20', rest: 'fill-muted-foreground/15' }
const SHARE_FILL: Record<Tone, string> = { in: 'fill-(--kincha-ink)', out: 'fill-primary', rest: 'fill-muted-foreground' }


const fit = (values: number[], slot: number, gap: number, height: number) => {
  let low = 0
  let high = height / Math.max(1, values.reduce((s, v) => s + v, 0))
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    const used = values.reduce((s, v) => s + Math.max(v * mid + LEAD, slot) + gap, 0)
    if (used > height) high = mid
    else low = mid
  }
  return low
}
const layout = (values: number[], scale: number, slot: number, gap: number) => {
  let top = 0
  return values.map((v) => {
    const height = Math.max(v * scale, 0)
    const size = Math.max(height + LEAD, slot)
    const node = { top, size, y: top + LEAD + (size - LEAD - height) / 2, height }
    top += size + gap
    return node
  })
}
const ribbon = (xa: number, ya: number, xb: number, yb: number, h: number) => {
  const mid = (xa + xb) / 2
  return `M${xa} ${ya}C${mid} ${ya},${mid} ${yb},${xb} ${yb}L${xb} ${yb + h}C${mid} ${yb + h},${mid} ${ya + h},${xa} ${ya + h}Z`
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** 入る（左）→ 一般会計（中）→ 使う（右）の流れ。割合は棒の真上、名前は棒の横、金額は hover・focus のツールチップ */
export function MoneyFlow({ incoming, outgoing, heads, label }: { incoming: Node[]; outgoing: Node[]; heads: [string, string, string]; /** 読み上げの名前。無ければ「入るお金から使うお金への流れ」の形 */ label?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { seen, still } = useFlowSeen(ref, `${heads.join()}:${incoming.reduce((t, n) => t + n.yen, 0)}:${outgoing.reduce((t, n) => t + n.yen, 0)}`)
  const width = useWidth(ref)
  const narrow = width < 560
  // 名前の欄は一番長い名前の幅だけ取り、残りを帯に回す（名前は全角なので文字数×文字の大きさで足りる）
  const nameWidth = (ns: Node[], size: number) => Math.max(0, ...ns.map((n) => Math.min(Array.from(n.label).length, narrow ? 10 : 99))) * size + GAP + 4
  const x0 = Math.min(nameWidth(incoming, narrow ? 10.5 : 13), width * 0.3)
  const x2 = Math.max(width - Math.min(nameWidth(outgoing, narrow ? 10.5 : 12), width * 0.32) - BAR, x0 + 2 * BAR + 80)
  const x1 = (x0 + x2) / 2
  const inGap = 6
  const outGap = 4
  const room = Math.max(380, incoming.length * (IN_SLOT + inGap) + 160, outgoing.length * (OUT_SLOT + outGap) + 160)
  const scale = Math.min(fit(incoming.map((n) => n.yen), IN_SLOT, inGap, room), fit(outgoing.map((n) => n.yen), OUT_SLOT, outGap, room))
  const ins = layout(incoming.map((n) => n.yen), scale, IN_SLOT, inGap)
  const outs = layout(outgoing.map((n) => n.yen), scale, OUT_SLOT, outGap)
  const end = (xs: { top: number; size: number }[]) => (xs.length ? xs[xs.length - 1]!.top + xs[xs.length - 1]!.size : 0)
  const total = Math.max(end(ins), end(outs), 40)
  // 一般会計の棒は入る総額の高さで、図の中ほどに置く
  const midHeight = incoming.reduce((s, n) => s + n.yen, 0) * scale
  const midY = (total - midHeight) / 2 + LEAD / 2
  let inOffset = 0
  let outOffset = 0
  const share = (n: Node) => (n.base ? (formatShare(n.yen, n.base) ?? '') : '')
  const label = (n: Node) => (narrow && Array.from(n.label).length > 10 ? `${Array.from(n.label).slice(0, 9).join('')}…` : n.label)
  const pick = (fn?: () => void) => (fn ? { role: 'button', tabIndex: 0, className: 'cursor-pointer outline-none [&:hover_text[data-name]]:underline [&:focus-visible_rect]:fill-ring', onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } } } : {})
  return (
    <div ref={ref} className="relative w-full" style={{ height: total + HEAD }}>
      {width ? (
        <svg width={width} height={total + HEAD} role="img" aria-label={label ?? `${heads[0]}お金から${heads[2]}お金への流れ`} data-seen={seen ? '' : undefined} data-still={still ? '' : undefined} className="flow-svg block font-sans">
          <g aria-hidden="true" className="fill-muted-foreground" fontSize={11}>
            <text x={x0 + BAR} y={11} textAnchor="end">{heads[0]}</text>
            <text x={x1 + BAR / 2} y={11} textAnchor="middle">{heads[1]}</text>
            <text x={x2} y={11}>{heads[2]}</text>
          </g>
          <g transform={`translate(0 ${HEAD})`}>
            <g className="flow-ribbon">
              {incoming.map((n, i) => {
                const h = n.yen * scale
                const d = ribbon(x0 + BAR, ins[i]!.y, x1, midY + inOffset, h)
                inOffset += h
                return h > 0 ? <path key={n.id} d={d} className={RIBBON_FILL[n.tone]} /> : null
              })}
              {outgoing.map((n, i) => {
                const h = n.yen * scale
                const d = ribbon(x1 + BAR, midY + outOffset, x2, outs[i]!.y, h)
                outOffset += h
                return h > 0 ? <path key={n.id} d={d} className={RIBBON_FILL[n.tone]} /> : null
              })}
            </g>
            <rect x={x1} y={midY} width={BAR} height={Math.max(midHeight, 2)} rx={2} className="fill-muted-foreground" />
            {incoming.map((n, i) => {
              const node = ins[i]!
              const h = Math.max(node.height, 2)
              return (
                <AmountTip key={n.id} name={n.label} yen={n.yen} side="right" render={<g {...pick(n.onClick)} aria-label={n.label} />}>
                  <rect x={0} y={node.top} width={x0 + BAR} height={node.size} className="fill-transparent" />
                  <rect x={x0} y={node.y} width={BAR} height={h} rx={2} className={BAR_FILL[n.tone]} />
                  <text x={x0 + BAR / 2} y={node.y - 3} textAnchor="middle" className={cn('font-semibold tabular-nums', SHARE_FILL[n.tone])} fontSize={narrow ? 10 : 11}>{share(n)}</text>
                  <text x={x0 - GAP} y={node.y + h / 2} dy="0.35em" data-name="" textAnchor="end" className="fill-foreground" fontSize={narrow ? 10.5 : 13}>{label(n)}</text>
                </AmountTip>
              )
            })}
            {outgoing.map((n, i) => {
              const node = outs[i]!
              const h = Math.max(node.height, 2)
              return (
                <AmountTip key={n.id} name={n.label} yen={n.yen} side="left" render={<g {...pick(n.onClick)} aria-label={n.label} />}>
                  <g className="flow-node" style={{ animationDelay: `${650 + Math.min(i * 12, 240)}ms` }}>
                    <rect x={x2} y={node.top} width={width - x2} height={node.size} className="fill-transparent" />
                    <rect x={x2} y={node.y} width={BAR} height={h} rx={2} className={BAR_FILL[n.tone]} />
                    <text x={x2 + BAR / 2} y={node.y - 3} textAnchor="middle" className={cn('font-semibold tabular-nums', SHARE_FILL[n.tone])} fontSize={narrow ? 10 : 11}>{share(n)}</text>
                    <text x={x2 + BAR + GAP} y={node.y + h / 2} dy="0.35em" data-name="" className="fill-foreground" fontSize={narrow ? 10.5 : 12}>{label(n)}</text>
                  </g>
                </AmountTip>
              )
            })}
          </g>
        </svg>
      ) : null}
    </div>
  )
}

function Stat({ tone, word, sub, yen, per }: { tone: 'in' | 'out'; word: string; sub: string; yen: number; per: { label: string; yen: number } | null }) {
  const big = cn('block text-[22px] leading-tight font-semibold sm:text-[32px]', tone === 'in' ? 'text-(--kincha-ink)' : 'text-primary')
  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 sm:px-5 sm:py-4">
      <p className="text-sm text-muted-foreground">{word}</p>
      {/* 総額と1人あたりは同じ大きさ・同じ見出しの付け方で並べる（狭い幅は上下） */}
      <div className="mt-1 flex flex-col gap-x-6 gap-y-1 sm:flex-row sm:items-end">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">{sub}</span>
          <Amt yen={yen} className={big} />
        </span>
        {per ? (
          <span className="flex flex-col">
            <span className="text-xs text-muted-foreground">{per.label}</span>
            <Amt yen={per.yen} className={big} />
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** 歳入の無い年度・資料は出さない（呼ぶ側が doc を探す）。fields は歳出の分野（金額の多い順、その他は最後） */
export function IncomeFlow({ doc, phase, expTotal, fields, pop, openField }: {
  doc: RevenueDoc
  phase: 'initial' | 'settlement'
  expTotal: number
  fields: { id: string; name: string; yen: number }[]
  pop: number
  openField: (id: string) => void
}) {
  const words: [string, string] = phase === 'initial' ? ['入る', '使う'] : ['入った', '使った']
  const kan = doc.kan.filter((k): k is typeof k & { yen: number } => k.yen != null && k.yen > 0)
  // 入るは款（特別区税・交付金・国庫支出金など）で分ける。細かい款は名前が重なるので、多い順に7つまで出し、残りは「ほかの収入」にまとめる
  const sorted = [...kan].sort((a, b) => b.yen - a.yen)
  const shown = sorted.length > 8 ? sorted.slice(0, 7) : sorted
  const others = sorted.slice(shown.length).reduce((s, k) => s + k.yen, 0)
  const incoming: Node[] = [...shown.map((k) => ({ id: k.name, label: k.name, yen: k.yen, tone: 'in' as const, base: doc.total })), ...(others > 0 ? [{ id: 'others', label: 'ほかの収入', yen: others, tone: 'in' as const, base: doc.total }] : [])]
  const outgoing: Node[] = fields.filter((f) => f.yen > 0).map((f) => ({ id: f.id, label: f.name, yen: f.yen, tone: 'out' as const, base: expTotal, onClick: () => openField(f.id) }))
  // 決算は入ったお金が使ったお金より多い。差は翌年度へ繰り越すお金などなので、灰色で右に足して入ると使うの高さを揃える
  const rest = doc.total - expTotal
  if (rest > 0) outgoing.push({ id: 'rest', label: '翌年度へ繰り越すお金など', yen: rest, tone: 'rest' })
  // 入るの1人あたりは、歳入の総額でなく住民が納める税（区分「まちの税」の款の和）で割る
  const tax = kan.reduce((s, k) => s + (k.category === 'まちの税' ? k.yen : 0), 0)
  return (
    <section className="mb-8">
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat tone="in" word={words[0]} sub="歳入" yen={doc.total} per={pop && tax > 0 ? { label: '1人あたりの税金', yen: tax / pop } : null} />
        <Stat tone="out" word={words[1]} sub="歳出" yen={expTotal} per={pop ? { label: '1人あたり', yen: expTotal / pop } : null} />
      </div>
      {/* スマホは頁の左右の余白まで使って画面いっぱいに描く */}
      <div className="-mx-2 sm:mx-0">
        <MoneyFlow incoming={incoming} outgoing={outgoing} heads={[words[0], '一般会計', words[1]]} />
      </div>
    </section>
  )
}
