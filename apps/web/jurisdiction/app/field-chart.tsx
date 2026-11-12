// 分野の頁の内訳の円グラフ（穴を空けると中に書く幅が足りないので、穴の無い円にする）（shadcn の chart）。スマホでも読めるよう、名前・割合・金額はツールチップでなくグラフに書き込む。
// 太い切れは切れの中に、細い切れは外に線を引いて書く。recharts が重いので、分野の頁を開いたときだけ読む
// recharts は Pie を描き直すたびに伸びる動きをやり直し、動いている間は書き込みを隠す。頁のほかの state（タブの貼り付きなど）で描き直されても消えないよう、
// memo で描き直しを止め、動きは最初の1回だけ短く行う
import * as React from 'react'
import { Cell, Pie, PieChart, type PieLabelRenderProps } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'

export type Slice = { key: string; name: string; yen: number; color: string; ink: string }

/** この割合以上の切れは中に書く */
const INSIDE_MIN = 0.25
/** 外に書く名前の長さ。スマホの幅で切れの横に収まる長さで切る */
const NAME_MAX = 6
const RAD = Math.PI / 180
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 円が伸びきるまで。書き込みはその後に出るので短くする */
const GROW_MS = 500
/** グラフの幅がこれ以上なら外の書き込みを置く横幅が足りるので、円と高さを大きくする */
const WIDE_MIN = 640

function FieldChart({ slices, format }: { slices: Slice[]; format: (yen: number) => string }) {
  const config = React.useMemo(() => Object.fromEntries(slices.map((s) => [s.key, { label: s.name, color: s.color }])) satisfies ChartConfig, [slices])
  const [grown, setGrown] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  const [wide, setWide] = React.useState(false)
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= WIDE_MIN))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const label = React.useCallback((p: PieLabelRenderProps) => {
    const s = slices[Number(p.index)]!
    const percent = Number(p.percent ?? 0)
    const cx = Number(p.cx), cy = Number(p.cy), inner = Number(p.innerRadius), outer = Number(p.outerRadius), mid = Number(p.midAngle ?? 0)
    const cos = Math.cos(-mid * RAD), sin = Math.sin(-mid * RAD)
    const pct = `${(percent * 100).toFixed(1)}%`
    const full = `${s.name} ${pct} ${format(s.yen)}`
    if (percent >= INSIDE_MIN) {
      const r = inner ? (inner + outer) / 2 : outer * 0.55
      return (
        <text x={cx + r * cos} y={cy + r * sin} fill={s.ink} textAnchor="middle" className="tabular-nums">
          <title>{full}</title>
          <tspan x={cx + r * cos} dy="-1.1em" className="text-[11px]">{cut(s.name, 7)}</tspan>
          <tspan x={cx + r * cos} dy="1.25em" className="text-[13px] font-semibold">{pct}</tspan>
          <tspan x={cx + r * cos} dy="1.25em" className="text-[11px]">{format(s.yen)}</tspan>
        </text>
      )
    }
    // 外に書く: 切れの縁から少し出して横へ線を引く
    const sx = cx + (outer + 2) * cos, sy = cy + (outer + 2) * sin
    const mx = cx + (outer + 12) * cos, my = cy + (outer + 12) * sin
    const ex = mx + (cos >= 0 ? 10 : -10)
    const anchor = cos >= 0 ? 'start' : 'end'
    const tx = ex + (cos >= 0 ? 4 : -4)
    return (
      <g>
        {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${my}`} className="fill-none stroke-muted-foreground/50" />
        <text x={tx} y={my} textAnchor={anchor} className="fill-foreground tabular-nums">
          <title>{full}</title>
          <tspan x={tx} dy="-0.85em" className="text-[11px]">{cut(s.name, NAME_MAX)}</tspan>
          <tspan x={tx} dy="1.2em" className="fill-muted-foreground text-[11px]">{pct}</tspan>
          <tspan x={tx} dy="1.2em" className="fill-muted-foreground text-[11px]">{format(s.yen)}</tspan>
        </text>
      </g>
    )
  }, [slices, format])
  // 切った名前の全文は、支援技術向けに一覧でも持つ
  return (
    <>
    <ul className="sr-only">
      {slices.map((s) => <li key={s.key}>{s.name} {format(s.yen)}</li>)}
    </ul>
    <div ref={box}>
    <ChartContainer config={config} className={wide ? 'aspect-auto h-[420px] w-full' : 'aspect-auto h-[320px] w-full'} aria-hidden>
      <PieChart margin={{ top: 16, bottom: 16, left: 8, right: 8 }}>
        <Pie data={slices} dataKey="yen" nameKey="key" innerRadius={0} outerRadius={wide ? '72%' : '56%'} startAngle={90} endAngle={-270} stroke="var(--background)" strokeWidth={2} isAnimationActive={grown ? false : 'auto'} animationBegin={0} animationDuration={GROW_MS} onAnimationEnd={() => setGrown(true)} labelLine={false} label={label}>
          {slices.map((s) => <Cell key={s.key} fill={s.color} className="outline-none" />)}
        </Pie>
      </PieChart>
    </ChartContainer>
    </div>
    </>
  )
}

export default React.memo(FieldChart)
