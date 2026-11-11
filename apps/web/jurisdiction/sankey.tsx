// 款→項の全体図。款・項それぞれの列で、ラベルが重ならない高さを確保してから帯を渡す。
import * as React from 'react'
import { AmountTip } from './amount-tip'
import { formatShare, formatYen, type Drill } from './types'

const BAR = 8
const KAN_SLOT = 30
const KOU_SLOT = 18
const KAN_GAP = 4
const KOU_GAP = 3
/** ラベルの最小の高さとは別に、帯の太さに使う高さ */
const BAND_ROOM = 160
/** 図の上に出す款・項の列名の高さ */
const HEAD = 20

const amountText = (yen: number, missing?: boolean) => (missing ? '金額未記載' : formatYen(yen))

const fit = (values: number[], slot: number, gap: number, height: number) => {
  let low = 0
  let high = height
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    const used = values.reduce((sum, value) => sum + Math.max(value * mid, slot) + gap, 0)
    if (used > height) high = mid
    else low = mid
  }
  return low
}

const layout = (values: number[], scale: number, slot: number, gap: number) => {
  let top = 0
  return values.map((value) => {
    const height = Math.max(value * scale, 0)
    const size = Math.max(height, slot)
    const node = { top, size, y: top + (size - height) / 2, height }
    top += size + gap
    return node
  })
}

const ribbon = (xa: number, ya: number, ha: number, xb: number, yb: number, hb: number) => {
  const mid = (xa + xb) / 2
  return `M${xa} ${ya}C${mid} ${ya},${mid} ${yb},${xb} ${yb}L${xb} ${yb + hb}C${mid} ${yb + hb},${mid} ${ya + ha},${xa} ${ya + ha}Z`
}

const end = (nodes: { top: number; size: number }[]) => (nodes.length ? nodes[nodes.length - 1]!.top + nodes[nodes.length - 1]!.size : 0)

/** 款・項の金額から、列の位置と各段の高さを決める。高さ（total）は幅に依らない */
const geometry = (kanValues: number[], kouValues: number[], width: number, height: number) => {
  const narrow = width < 560
  const left = narrow ? 104 : 180
  const right = narrow ? 170 : 260
  // ラベルの最小の高さだけで指定の高さを超えると帯の太さが0になるので、そのときは図を縦に伸ばして帯の分を残す
  const floor = (n: number, slot: number, gap: number) => n * (slot + gap) + BAND_ROOM
  const room = Math.max(height, floor(kanValues.length, KAN_SLOT, KAN_GAP), floor(kouValues.length, KOU_SLOT, KOU_GAP))
  const scale = Math.min(fit(kanValues, KAN_SLOT, KAN_GAP, room), fit(kouValues, KOU_SLOT, KOU_GAP, room))
  const kans = layout(kanValues, scale, KAN_SLOT, KAN_GAP)
  const kouNodes = layout(kouValues, scale, KOU_SLOT, KOU_GAP)
  const x0 = left
  const x1 = Math.max(width - right - BAR, x0 + BAR + 40)
  return { narrow, x0, x1, kans, kouNodes, total: Math.max(end(kans), end(kouNodes), 40) }
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

/** 款・項のラベルと棒は押せる。押すとその款（と項）の内訳へ移る */
const pick = (fn: () => void) => ({
  role: 'button',
  tabIndex: 0,
  className: 'cursor-pointer outline-none [&:hover_text]:underline [&:focus-visible_rect]:fill-ring',
  onClick: fn,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } },
})

/** total は割合の基準（その年度の全体）。ラベルは割合だけ出し、金額は hover・focus のツールチップで見せる */
export function Overview({ flows, total: base, height = 520, levels = { kan: '款', kou: '項' }, onSelect }: { flows: Drill[]; total: number; height?: number; levels?: { kan: string; kou: string }; onSelect?: (kan: number, kou?: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  // 図が画面に入ってから流れの動きを始める。動きを減らす設定なら、帯の上を流れる光も出さない
  const [seen, setSeen] = React.useState(false)
  const [still, setStill] = React.useState(true)
  React.useEffect(() => {
    setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); observer.disconnect() } }, { threshold: 0.2 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const flowId = React.useId()
  const pct = (yen: number, missing?: boolean) => formatShare(yen, base, missing) ?? '—'
  const width = useWidth(ref)
  const kous = flows.flatMap((flow, kanIndex) => flow.kou.map((kou, kouIndex) => ({ kanIndex, kouIndex, kou })))
  const { narrow, x0, x1, kans, kouNodes, total } = geometry(flows.map((flow) => Math.max(0, flow.kan.yen)), kous.map(({ kou }) => Math.max(0, kou.yen)), width, height)
  const cut = (name: string, n: number) => (Array.from(name).length > n ? `${Array.from(name).slice(0, n - 1).join('')}…` : name)
  const offsets = new Map<number, number>()
  return (
    // 幅を測る前（最初の描画）から図の高さを取っておき、読み込み中の形から図に替わるときに下が動かないようにする
    <div ref={ref} className="relative w-full" style={{ height: total + HEAD }}>
      {width ? (
        <svg width={width} height={total + HEAD} role="img" aria-label={`${levels.kan}から${levels.kou}への歳出の流れ`} data-seen={seen ? '' : undefined} className="flow-svg block font-sans">
          {/* 帯の上を左から右へ流れる光。大分類（款）から中分類（項）へお金が流れていく感じを出す。帯が伸びきったあとから流す */}
          <defs>
            <linearGradient id={flowId} gradientUnits="userSpaceOnUse" x1={x0 - 160} x2={x0} y1={0} y2={0}>
              <stop offset="0" stopColor="var(--primary)" stopOpacity={0} />
              <stop offset="0.5" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="1" stopColor="var(--primary)" stopOpacity={0} />
              {seen && !still ? <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to={`${x1 - x0 + 160} 0`} dur="2.8s" begin="1.1s" repeatCount="indefinite" /> : null}
            </linearGradient>
          </defs>
          <g aria-hidden="true" className="fill-muted-foreground" fontSize={11}>
            <text x={x0 + BAR} y={11} textAnchor="end">{levels.kan}</text>
            <text x={x1} y={11}>{levels.kou}</text>
          </g>
          <g transform={`translate(0 ${HEAD})`}>
          {/* 帯はまとめて一枚で左から右へ伸ばす。帯ごとにずらすと先端がぎざぎざになり、切れて見えるため */}
          <g className="flow-ribbon">
          {kous.map(({ kanIndex, kou }, i) => {
            const source = kans[kanIndex]!
            const offset = offsets.get(kanIndex) ?? 0
            const h = kouNodes[i]!.height
            offsets.set(kanIndex, offset + h)
            if (h <= 0) return null
            const d = ribbon(x0 + BAR, source.y + offset, h, x1, kouNodes[i]!.y, h)
            return (
              <g key={kou.id}>
                <path d={d} className="fill-primary/20" />
                {!still ? <path d={d} fill={`url(#${CSS.escape(flowId)})`} /> : null}
              </g>
            )
          })}
          </g>
          {flows.map((flow, i) => {
            const node = kans[i]!
            const label = narrow ? cut(flow.kan.name, 9) : flow.kan.name
            return (
              <AmountTip key={flow.kan.id} name={flow.kan.name} yen={flow.kan.yen} missing={flow.kan.amountMissing} side="right" render={<g {...(onSelect ? pick(() => onSelect(i)) : {})} aria-label={`${flow.kan.name} ${amountText(flow.kan.yen, flow.kan.amountMissing)}${onSelect ? '、内訳を見る' : ''}`} />}>
                <rect x={0} y={node.top} width={x0 + BAR} height={node.size} className="fill-transparent" />
                <rect x={x0} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-primary" />
                <text x={x0 - 8} y={node.top + node.size / 2 - 2} textAnchor="end" className="fill-foreground" fontSize={narrow ? 10.5 : 13}>{label}</text>
                <text x={x0 - 8} y={node.top + node.size / 2 + 12} textAnchor="end" className="fill-primary font-semibold tabular-nums" fontSize={narrow ? 10 : 11.5}>{pct(flow.kan.yen, flow.kan.amountMissing)}</text>
              </AmountTip>
            )
          })}
          {kous.map(({ kanIndex, kouIndex, kou }, i) => {
            const node = kouNodes[i]!
            return (
              <AmountTip key={kou.id} name={kou.name} yen={kou.yen} missing={kou.amountMissing} side="left" render={<g {...(onSelect ? pick(() => onSelect(kanIndex, kouIndex)) : {})} aria-label={`${kou.name} ${amountText(kou.yen, kou.amountMissing)}${onSelect ? '、内訳を見る' : ''}`} />}>
                <g className="flow-node" style={{ animationDelay: `${650 + Math.min(i * 12, 240)}ms` }}>
                <rect x={x1} y={node.top} width={width - x1} height={node.size} className="fill-transparent" />
                <rect x={x1} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-primary" />
                <text x={x1 + BAR + 8} y={node.top + node.size / 2 + 4} className="fill-foreground" fontSize={narrow ? 10.5 : 12}>
                  {cut(kou.name, narrow ? 10 : Math.max(10, Math.floor((width - x1 - BAR - 8 - 44) / 12)))}
                  <tspan dx={6} className="fill-primary font-semibold tabular-nums" fontSize={narrow ? 10 : 11}>{pct(kou.yen, kou.amountMissing)}</tspan>
                </text>
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

/** 読み込み中の全体図。図と同じ並べ方・高さで、款・項の棒と帯、ラベルの置き場を薄い色で出す。
 * 款ごとの項の金額の比は、品川区 R8 当初予算の分野（大分類10・中分類24）を丸めた仮のもの。多くの自治体で図の高さがほぼ同じになる */
const SKELETON = [[0.29, 0.06, 0.054, 0.052, 0.053], [0.108, 0.024], [0.051, 0.026, 0.002, 0.022], [0.059, 0.005], [0.019, 0.016, 0.008], [0.037, 0.004], [0.037, 0.002], [0.03, 0.008], [0.028], [0.006]]
/** ラベルの置き場の長さ（px）。同じ長さが並ぶと縞に見えるので、少しずつ変える */
const LABEL_WIDTHS = [64, 44, 56, 72, 40, 52]
export function OverviewSkeleton({ height = 520, levels = { kan: '款', kou: '項' } }: { height?: number; levels?: { kan: string; kou: string } }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const kous = SKELETON.flatMap((kou, kanIndex) => kou.map((yen) => ({ kanIndex, yen })))
  const { narrow, x0, x1, kans, kouNodes, total } = geometry(SKELETON.map((kou) => kou.reduce((a, v) => a + v, 0)), kous.map((k) => k.yen), width, height)
  const offsets = new Map<number, number>()
  const line = narrow ? 8 : 10
  return (
    <div ref={ref} role="status" aria-label="お金の流れを読み込んでいます" className="relative w-full" style={{ height: total + HEAD }}>
      {width ? (
        <svg width={width} height={total + HEAD} aria-hidden="true" className="block animate-pulse font-sans">
          <g className="fill-muted-foreground" fontSize={11}>
            <text x={x0 + BAR} y={11} textAnchor="end">{levels.kan}</text>
            <text x={x1} y={11}>{levels.kou}</text>
          </g>
          <g transform={`translate(0 ${HEAD})`}>
            {kous.map(({ kanIndex }, i) => {
              const source = kans[kanIndex]!
              const offset = offsets.get(kanIndex) ?? 0
              const h = kouNodes[i]!.height
              offsets.set(kanIndex, offset + h)
              return <path key={i} d={ribbon(x0 + BAR, source.y + offset, h, x1, kouNodes[i]!.y, h)} className="fill-muted/70" />
            })}
            {kans.map((node, i) => {
              const w = (narrow ? 0.7 : 1) * LABEL_WIDTHS[i % LABEL_WIDTHS.length]!
              const mid = node.top + node.size / 2
              return (
                <g key={i}>
                  <rect x={x0} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-muted" />
                  <rect x={x0 - 8 - w} y={mid - line - 1} width={w} height={line} rx={line / 2} className="fill-muted" />
                  <rect x={x0 - 8 - 26} y={mid + 3} width={26} height={line - 2} rx={(line - 2) / 2} className="fill-muted" />
                </g>
              )
            })}
            {kouNodes.map((node, i) => {
              const w = Math.min((narrow ? 0.8 : 1.4) * LABEL_WIDTHS[(i + 3) % LABEL_WIDTHS.length]!, width - x1 - BAR - 8 - 36)
              const mid = node.top + node.size / 2
              return (
                <g key={i}>
                  <rect x={x1} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-muted" />
                  <rect x={x1 + BAR + 8} y={mid - line / 2} width={Math.max(w, 24)} height={line} rx={line / 2} className="fill-muted" />
                  <rect x={x1 + BAR + 8 + Math.max(w, 24) + 6} y={mid - (line - 2) / 2} width={24} height={line - 2} rx={(line - 2) / 2} className="fill-muted" />
                </g>
              )
            })}
          </g>
        </svg>
      ) : null}
    </div>
  )
}
