// 分野の頁の内訳の円グラフ（shadcn の chart）。スマホでも読めるよう、名前・割合・金額はツールチップでなくグラフに書き込む。
// 太い切れは切れの中に、細い切れは外に線を引いて書く。recharts が重いので、分野の頁を開いたときだけ読む
import { Cell, Pie, PieChart, type PieLabelRenderProps } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'

export type Slice = { key: string; name: string; yen: number; color: string; ink: string }

/** この割合以上の切れは中に書く */
const INSIDE_MIN = 0.16
/** 外に書く名前の長さ。長い分類名はここで切る */
const NAME_MAX = 9
const RAD = Math.PI / 180
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export default function FieldChart({ slices, format }: { slices: Slice[]; format: (yen: number) => string }) {
  const config = Object.fromEntries(slices.map((s) => [s.key, { label: s.name, color: s.color }])) satisfies ChartConfig
  const label = (p: PieLabelRenderProps) => {
    const s = slices[Number(p.index)]!
    const percent = Number(p.percent ?? 0)
    const cx = Number(p.cx), cy = Number(p.cy), inner = Number(p.innerRadius), outer = Number(p.outerRadius), mid = Number(p.midAngle ?? 0)
    const cos = Math.cos(-mid * RAD), sin = Math.sin(-mid * RAD)
    const pct = `${(percent * 100).toFixed(1)}%`
    if (percent >= INSIDE_MIN) {
      const r = (inner + outer) / 2
      return (
        <text x={cx + r * cos} y={cy + r * sin} fill={s.ink} textAnchor="middle" className="tabular-nums">
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
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${my}`} className="fill-none stroke-muted-foreground/50" />
        <text x={tx} y={my} textAnchor={anchor} className="fill-foreground tabular-nums">
          <tspan x={tx} dy="-0.25em" className="text-[11px]">{cut(s.name, NAME_MAX)}</tspan>
          <tspan x={tx} dy="1.2em" className="fill-muted-foreground text-[11px]">{pct} · {format(s.yen)}</tspan>
        </text>
      </g>
    )
  }
  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <PieChart margin={{ top: 16, bottom: 16, left: 8, right: 8 }}>
        <Pie data={slices} dataKey="yen" nameKey="key" innerRadius="38%" outerRadius="72%" startAngle={90} endAngle={-270} stroke="var(--background)" strokeWidth={2} isAnimationActive labelLine={false} label={label}>
          {slices.map((s) => <Cell key={s.key} fill={s.color} className="outline-none" />)}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
