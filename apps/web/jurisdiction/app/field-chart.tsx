// 分野の頁の内訳の円グラフ（shadcn の chart）。スマホでも読めるよう、割合はツールチップでなくグラフの上に書く。
// recharts が重いので、分野の頁を開いたときだけ読む
import { Cell, Pie, PieChart, type PieLabelRenderProps } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'

export type Slice = { key: string; name: string; yen: number; color: string; ink: string }

/** この割合より細い切れには書かない（文字が切れからはみ出すため）。名前と金額は横の一覧に出す */
const LABEL_MIN = 0.06
const RAD = Math.PI / 180

export default function FieldChart({ slices }: { slices: Slice[] }) {
  const config = Object.fromEntries(slices.map((s) => [s.key, { label: s.name, color: s.color }])) satisfies ChartConfig
  const label = (p: PieLabelRenderProps) => {
    const percent = Number(p.percent ?? 0)
    if (percent < LABEL_MIN) return null
    const inner = Number(p.innerRadius), outer = Number(p.outerRadius), mid = Number(p.midAngle ?? 0)
    const r = (inner + outer) / 2
    const x = Number(p.cx) + r * Math.cos(-mid * RAD)
    const y = Number(p.cy) + r * Math.sin(-mid * RAD)
    const s = slices[Number(p.index)]!
    return <text x={x} y={y} fill={s.ink} textAnchor="middle" dominantBaseline="central" className="text-[11px] font-semibold tabular-nums">{Math.round(percent * 100)}%</text>
  }
  return (
    <ChartContainer config={config} className="aspect-square w-full max-w-[220px]">
      <PieChart>
        <Pie data={slices} dataKey="yen" nameKey="key" innerRadius="52%" outerRadius="100%" stroke="var(--background)" strokeWidth={2} isAnimationActive labelLine={false} label={label}>
          {slices.map((s) => <Cell key={s.key} fill={s.color} className="outline-none" />)}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
