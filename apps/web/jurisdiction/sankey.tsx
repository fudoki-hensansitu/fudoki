// 款→項の全体図。款・項それぞれの列で、ラベルが重ならない高さを確保してから帯を渡す。
import * as React from 'react'
import { AmountTip } from './amount-tip'
import { formatShare, formatYen, type Drill } from './types'

const BAR = 8
const KAN_SLOT = 30
/** 項の名前は棒の中ほどに置くので、棒の上の割合の分（LEAD）と名前の高さを足した高さを取る */
const KOU_SLOT = 26
const KAN_GAP = 4
const KOU_GAP = 3
/** ラベルの最小の高さとは別に、帯の太さに使う高さ */
const BAND_ROOM = 160
/** 図の上に出す款・項の列名の高さ */
const HEAD = 20
/** 棒の真上に割合を出すために、棒の上に空ける高さ */
const LEAD = 13
/** 棒と名前の間。棒の上の割合（「<0.1%」まで）が細い棒で名前に掛からない幅を空ける */
const GAP = 14

const amountText = (yen: number, missing?: boolean) => (missing ? '金額未記載' : formatYen(yen))

/** 名前の1行の高さ */
const lineOf = (size: number) => Math.round(size * 1.25)
/** 名前を切らずに、1行 chars 文字までで折る（全角を1文字として数える）。行の長さはなるべく揃える */
export const wrapName = (name: string, chars: number) => {
  const cs = Array.from(name)
  const lines = Math.max(1, Math.ceil(cs.length / Math.max(1, chars)))
  const per = Math.ceil(cs.length / lines)
  return Array.from({ length: lines }, (_, i) => cs.slice(i * per, (i + 1) * per).join(''))
}
/** 名前の行数に応じた段の高さ。1行は slot、2行目からは1行の高さずつ足す */
export const slotsFor = (names: string[][], slot: number, size: number) => names.map((lines) => slot + (lines.length - 1) * lineOf(size))
/** 折った名前。y を行のまとまりの真ん中にする */
export function NameText({ x, y, lines, size, anchor }: { x: number; y: number; lines: string[]; size: number; anchor?: 'start' | 'end' }) {
  const lh = lineOf(size)
  return (
    <text x={x} y={y} data-name="" textAnchor={anchor} className="fill-foreground" fontSize={size}>
      {lines.map((line, i) => <tspan key={i} x={x} dy={i ? lh : size * 0.35 - ((lines.length - 1) * lh) / 2}>{line}</tspan>)}
    </text>
  )
}

const at = (slot: number | number[], i: number) => (typeof slot === 'number' ? slot : slot[i]!)

export const fit = (values: number[], slot: number | number[], gap: number, height: number) => {
  // 帯の倍率は金額の和に反比例する（東京都の約9兆円で 1e-11 ほど）。上限を和で割っておかないと、40回の二分探索の刻みが倍率より粗くなり帯の太さが0になる
  let low = 0
  let high = height / Math.max(1, values.reduce((sum, value) => sum + value, 0))
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    const used = values.reduce((sum, value, i) => sum + Math.max(value * mid + LEAD, at(slot, i)) + gap, 0)
    if (used > height) high = mid
    else low = mid
  }
  return low
}

export const layout = (values: number[], scale: number, slot: number | number[], gap: number) => {
  let top = 0
  return values.map((value, i) => {
    const height = Math.max(value * scale, 0)
    // 棒の上に割合の分（LEAD）を空け、残りの中ほどに棒を置く
    const size = Math.max(height + LEAD, at(slot, i))
    const node = { top, size, y: top + LEAD + (size - LEAD - height) / 2, height }
    top += size + gap
    return node
  })
}

const ribbon = (xa: number, ya: number, ha: number, xb: number, yb: number, hb: number) => {
  const mid = (xa + xb) / 2
  return `M${xa} ${ya}C${mid} ${ya},${mid} ${yb},${xb} ${yb}L${xb} ${yb + hb}C${mid} ${yb + hb},${mid} ${ya + ha},${xa} ${ya + ha}Z`
}

const end = (nodes: { top: number; size: number }[]) => (nodes.length ? nodes[nodes.length - 1]!.top + nodes[nodes.length - 1]!.size : 0)

/** 款・項の金額と名前から、列の位置・名前の折り方と各段の高さを決める。名前を折る分だけ段が高くなる */
const geometry = (kanValues: number[], kouValues: number[], width: number, height: number, kanNames?: string[], kouNames?: string[]) => {
  const narrow = width < 560
  // 名前は切らずに折るので、狭い画面では名前の欄を細くして帯に幅を回す（款は1行7文字、項は10文字ほど）
  const left = narrow ? 92 : 180
  const right = narrow ? 124 : 260
  const x0 = left
  const x1 = Math.max(width - right - BAR, x0 + BAR + 40)
  const kanSize = narrow ? 10.5 : 13
  const kouSize = narrow ? 10.5 : 12
  // 幅を測る前は1行として高さを取る
  const wrapAll = (names: string[] | undefined, n: number, room: number, size: number) => Array.from({ length: n }, (_, i) => (width ? wrapName(names?.[i] ?? '', Math.floor(room / size)) : ['']))
  const kanLines = wrapAll(kanNames, kanValues.length, x0 - GAP - 2, kanSize)
  const kouLines = wrapAll(kouNames, kouValues.length, width - x1 - BAR - GAP - 4, kouSize)
  const kanSlots = slotsFor(kanLines, KAN_SLOT, kanSize)
  const kouSlots = slotsFor(kouLines, KOU_SLOT, kouSize)
  // ラベルの最小の高さだけで指定の高さを超えると帯の太さが0になるので、そのときは図を縦に伸ばして帯の分を残す
  const floor = (slots: number[], gap: number) => slots.reduce((sum, slot) => sum + slot + gap, 0) + BAND_ROOM
  const room = Math.max(height, floor(kanSlots, KAN_GAP), floor(kouSlots, KOU_GAP))
  const scale = Math.min(fit(kanValues, kanSlots, KAN_GAP, room), fit(kouValues, kouSlots, KOU_GAP, room))
  const kans = layout(kanValues, scale, kanSlots, KAN_GAP)
  const kouNodes = layout(kouValues, scale, kouSlots, KOU_GAP)
  return { narrow, x0, x1, kans, kouNodes, kanLines, kouLines, kanSize, kouSize, total: Math.max(end(kans), end(kouNodes), 40) }
}

// タブへ移ると、すぐ描いた頁を loader が読み終えた頁で作り直す。同じ図を少し前に描いたなら、作り直した図では帯を伸ばし直さない（FieldsSection の grownAt と同じ）
const drawnAt = new Map<string, number>()
/** 図が画面に入ったら true（帯が伸び始める）。still は少し前に同じ図を描いたので動かさないとき */
export function useFlowSeen(ref: React.RefObject<HTMLElement | null>, key: string) {
  const [still] = React.useState(() => {
    // サーバーの描画は頁ごとに1回なので覚えない
    if (typeof window === 'undefined') return false
    const last = drawnAt.get(key)
    drawnAt.set(key, Date.now())
    return last !== undefined && Date.now() - last < 5000
  })
  const [seen, setSeen] = React.useState(still)
  React.useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const observer = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); observer.disconnect() } }, { threshold: 0.2 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { seen, still }
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
  className: 'cursor-pointer outline-none [&:hover_text[data-name]]:underline [&:focus-visible_rect]:fill-ring',
  onClick: fn,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } },
})

/** total は割合の基準（その年度の全体）。割合は棒の真上に、名前は棒の横に出し、金額は hover・focus のツールチップで見せる */
export function Overview({ flows, total: base, height = 520, levels = { kan: '款', kou: '項' }, onSelect, mirror, label = '歳出' }: { flows: Drill[]; total: number; height?: number; levels?: { kan: string; kou: string }; onSelect?: (kan: number, kou?: number) => void; /** 左右を逆にする（項が左、款が右）。歳入を歳出の全体図の左に並べ、款どうしを真ん中で向き合わせる */ mirror?: boolean; /** 何の流れか（読み上げ用） */ label?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  // 図が画面に入ってから帯が伸びる動きを始める
  const { seen, still } = useFlowSeen(ref, `${levels.kan}:${base}:${flows.length}:${mirror ? 1 : 0}`)
  const pct = (yen: number, missing?: boolean) => formatShare(yen, base, missing) ?? '—'
  const width = useWidth(ref)
  const kous = flows.flatMap((flow, kanIndex) => flow.kou.map((kou, kouIndex) => ({ kanIndex, kouIndex, kou })))
  const { narrow, x0, x1, kans, kouNodes, kanLines, kouLines, kanSize, kouSize, total } = geometry(flows.map((flow) => Math.max(0, flow.kan.yen)), kous.map(({ kou }) => Math.max(0, kou.yen)), width, height, flows.map((flow) => flow.kan.name), kous.map(({ kou }) => kou.name))
  const offsets = new Map<number, number>()
  // 左右を逆にするときは、x を図の幅から引き、棒は右端から、文字の寄せも逆にする
  const X = (x: number) => (mirror ? width - x : x)
  const left = (x: number, w: number) => (mirror ? width - x - w : x)
  const start = mirror ? 'end' : 'start'
  const endAnchor = mirror ? 'start' : 'end'
  const kanSide = mirror ? 'left' : 'right'
  const kouSide = mirror ? 'right' : 'left'
  return (
    // 幅を測る前（最初の描画）から図の高さを取っておき、読み込み中の形から図に替わるときに下が動かないようにする
    <div ref={ref} className="relative w-full" style={{ height: total + HEAD }}>
      {width ? (
        <svg width={width} height={total + HEAD} role="img" aria-label={`${levels.kan}から${levels.kou}への${label}の流れ`} data-seen={seen ? '' : undefined} data-still={still ? '' : undefined} data-mirror={mirror ? '' : undefined} className="flow-svg block font-sans">
          <g aria-hidden="true" className="fill-muted-foreground" fontSize={11}>
            <text x={X(x0 + BAR)} y={11} textAnchor={endAnchor}>{levels.kan}</text>
            <text x={X(x1)} y={11} textAnchor={start}>{levels.kou}</text>
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
            const d = ribbon(X(x0 + BAR), source.y + offset, h, X(x1), kouNodes[i]!.y, h)
            return (
              // oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで
              <path key={kou.id} d={d} className="fill-primary/20" />
            )
          })}
          </g>
          {flows.map((flow, i) => {
            const node = kans[i]!
            return (
              <AmountTip key={flow.kan.id} name={flow.kan.name} yen={flow.kan.yen} missing={flow.kan.amountMissing} side={kanSide} render={<g {...(onSelect ? pick(() => onSelect(i)) : {})} aria-label={`${flow.kan.name} ${amountText(flow.kan.yen, flow.kan.amountMissing)}${onSelect ? '、内訳を見る' : ''}`} />}>
                <rect x={left(0, x0 + BAR)} y={node.top} width={x0 + BAR} height={node.size} className="fill-transparent" />
                <rect x={left(x0, BAR)} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-primary" />
                <text x={X(x0 + BAR / 2)} y={node.y - 3} textAnchor="middle" className="fill-primary font-semibold tabular-nums" fontSize={narrow ? 10 : 11}>{pct(flow.kan.yen, flow.kan.amountMissing)}</text>
                <NameText x={X(x0 - GAP)} y={node.y + Math.max(node.height, 2) / 2} lines={kanLines[i]!} size={kanSize} anchor={endAnchor} />
              </AmountTip>
            )
          })}
          {kous.map(({ kanIndex, kouIndex, kou }, i) => {
            const node = kouNodes[i]!
            return (
              <AmountTip key={kou.id} name={kou.name} yen={kou.yen} missing={kou.amountMissing} side={kouSide} render={<g {...(onSelect ? pick(() => onSelect(kanIndex, kouIndex)) : {})} aria-label={`${kou.name} ${amountText(kou.yen, kou.amountMissing)}${onSelect ? '、内訳を見る' : ''}`} />}>
                <g className="flow-node" style={{ animationDelay: `${650 + Math.min(i * 12, 240)}ms` }}>
                <rect x={left(x1, width - x1)} y={node.top} width={width - x1} height={node.size} className="fill-transparent" />
                <rect x={left(x1, BAR)} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-primary" />
                <text x={X(x1 + BAR / 2)} y={node.y - 3} textAnchor="middle" className="fill-primary font-semibold tabular-nums" fontSize={narrow ? 10 : 11}>{pct(kou.yen, kou.amountMissing)}</text>
                <NameText x={X(x1 + BAR + GAP)} y={node.y + Math.max(node.height, 2) / 2} lines={kouLines[i]!} size={kouSize} anchor={start} />
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
 * 款ごとの項の金額の比は、品川区 R8 当初予算の分野（大分類10・中分類24）を丸めた仮のもの。項の多い自治体・款・項では、図に替わるときに少し伸びる */
const SKELETON = [[0.29, 0.06, 0.054, 0.052, 0.053], [0.108, 0.024], [0.051, 0.026, 0.002, 0.022], [0.059, 0.005], [0.019, 0.016, 0.008], [0.037, 0.004], [0.037, 0.002], [0.03, 0.008], [0.028], [0.006]]
/** ラベルの置き場の長さ（px）。同じ長さが並ぶと縞に見えるので、少しずつ変える */
const LABEL_WIDTHS = [64, 44, 56, 72, 40, 52]
/** total は読み込む年度の総額。比に掛けて実際の図と同じ桁の金額で並べる（fit の二分探索の刻みが金額の桁で変わり、比のままだと図より高くなる） */
export function OverviewSkeleton({ total: yen, height = 520, levels = { kan: '款', kou: '項' } }: { total: number; height?: number; levels?: { kan: string; kou: string } }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const base = yen > 0 ? yen : 1e11
  const kous = SKELETON.flatMap((kou, kanIndex) => kou.map((share) => ({ kanIndex, yen: share * base })))
  const { narrow, x0, x1, kans, kouNodes, total } = geometry(SKELETON.map((kou) => kou.reduce((a, v) => a + v, 0) * base), kous.map((k) => k.yen), width, height)
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
              // oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで
              return <path key={i} d={ribbon(x0 + BAR, source.y + offset, h, x1, kouNodes[i]!.y, h)} className="fill-muted/70" />
            })}
            {kans.map((node, i) => {
              const w = (narrow ? 0.7 : 1) * LABEL_WIDTHS[i % LABEL_WIDTHS.length]!
              const mid = node.y + Math.max(node.height, 2) / 2
              return (
                <g key={i}>
                  <rect x={x0 + BAR / 2 - 11} y={node.y - 3 - (line - 2)} width={22} height={line - 2} rx={(line - 2) / 2} className="fill-muted" />
                  <rect x={x0} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-muted" />
                  <rect x={x0 - GAP - w} y={mid - line / 2} width={w} height={line} rx={line / 2} className="fill-muted" />
                </g>
              )
            })}
            {kouNodes.map((node, i) => {
              const w = Math.min((narrow ? 0.8 : 1.4) * LABEL_WIDTHS[(i + 3) % LABEL_WIDTHS.length]!, width - x1 - BAR - GAP - 36)
              const mid = node.y + Math.max(node.height, 2) / 2
              return (
                <g key={i}>
                  <rect x={x1 + BAR / 2 - 11} y={node.y - 3 - (line - 2)} width={22} height={line - 2} rx={(line - 2) / 2} className="fill-muted" />
                  <rect x={x1} y={node.y} width={BAR} height={Math.max(node.height, 2)} rx={2} className="fill-muted" />
                  <rect x={x1 + BAR + GAP} y={mid - line / 2} width={Math.max(w, 24)} height={line} rx={line / 2} className="fill-muted" />
                </g>
              )
            })}
          </g>
        </svg>
      ) : null}
    </div>
  )
}
