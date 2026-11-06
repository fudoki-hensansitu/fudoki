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

/** 款・項のラベルと棒は押せる。押すとその款（と項）の内訳へ移る */
const pick = (fn: () => void) => ({
  role: 'button',
  tabIndex: 0,
  className: 'cursor-pointer outline-none [&:hover_text]:underline [&:focus-visible_rect]:fill-ring',
  onClick: fn,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } },
})

/** total は割合の基準（その年度の全体）。ラベルは割合だけ出し、金額は hover・focus のツールチップで見せる */
export function Overview({ flows, total: base, height = 520, onSelect }: { flows: Drill[]; total: number; height?: number; onSelect?: (kan: number, kou?: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)
  const pct = (yen: number, missing?: boolean) => formatShare(yen, base, missing) ?? '—'
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  const narrow = width < 560
  const left = narrow ? 104 : 180
  const right = narrow ? 170 : 260
  const kous = flows.flatMap((flow, kanIndex) => flow.kou.map((kou, kouIndex) => ({ kanIndex, kouIndex, kou })))
  const kanValues = flows.map((flow) => Math.max(0, flow.kan.yen))
  const kouValues = kous.map(({ kou }) => Math.max(0, kou.yen))
  // ラベルの最小の高さだけで指定の高さを超えると帯の太さが0になるので、そのときは図を縦に伸ばして帯の分を残す
  const floor = (n: number, slot: number, gap: number) => n * (slot + gap) + BAND_ROOM
  const room = Math.max(height, floor(kanValues.length, KAN_SLOT, KAN_GAP), floor(kouValues.length, KOU_SLOT, KOU_GAP))
  const scale = Math.min(fit(kanValues, KAN_SLOT, KAN_GAP, room), fit(kouValues, KOU_SLOT, KOU_GAP, room))
  const kans = layout(kanValues, scale, KAN_SLOT, KAN_GAP)
  const kouNodes = layout(kouValues, scale, KOU_SLOT, KOU_GAP)
  const x0 = left
  const x1 = Math.max(width - right - BAR, x0 + BAR + 40)
  const cut = (name: string, n: number) => (narrow && Array.from(name).length > n ? `${Array.from(name).slice(0, n - 1).join('')}…` : name)
  const offsets = new Map<number, number>()
  const end = (nodes: { top: number; size: number }[]) => (nodes.length ? nodes[nodes.length - 1]!.top + nodes[nodes.length - 1]!.size : 0)
  const total = Math.max(end(kans), end(kouNodes), 40)
  return (
    <div ref={ref} className="relative w-full">
      {width ? (
        <svg width={width} height={total + HEAD} role="img" aria-label="款から項への歳出の流れ" className="block font-sans">
          <g aria-hidden="true" className="fill-muted-foreground" fontSize={11}>
            <text x={x0 + BAR} y={11} textAnchor="end">款</text>
            <text x={x1} y={11}>項</text>
          </g>
          <g transform={`translate(0 ${HEAD})`}>
          {kous.map(({ kanIndex, kou }, i) => {
            const source = kans[kanIndex]!
            const offset = offsets.get(kanIndex) ?? 0
            const h = kouNodes[i]!.height
            offsets.set(kanIndex, offset + h)
            if (h <= 0) return null
            return <path key={kou.id} d={ribbon(x0 + BAR, source.y + offset, h, x1, kouNodes[i]!.y, h)} className="fill-primary/20" />
          })}
          {flows.map((flow, i) => {
            const node = kans[i]!
            const label = cut(flow.kan.name, 9)
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
                <rect x={x1} y={node.top} width={width - x1} height={node.size} className="fill-transparent" />
                <rect x={x1} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-primary" />
                <text x={x1 + BAR + 8} y={node.top + node.size / 2 + 4} className="fill-foreground" fontSize={narrow ? 10.5 : 12}>
                  {cut(kou.name, 10)}
                  <tspan dx={6} className="fill-primary font-semibold tabular-nums" fontSize={narrow ? 10 : 11}>{pct(kou.yen, kou.amountMissing)}</tspan>
                </text>
              </AmountTip>
            )
          })}
          </g>
        </svg>
      ) : null}
    </div>
  )
}
