// 分野の頁の内訳の円グラフ（shadcn の chart）。recharts が重いので、分野の頁を開いたときだけ読む
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export type Slice = { key: string; name: string; yen: number; color: string }

export default function FieldChart({ slices, format, onPick }: { slices: Slice[]; format: (yen: number) => string; onPick: (key: string) => void }) {
  const config = Object.fromEntries(slices.map((s) => [s.key, { label: s.name, color: s.color }])) satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-square w-full max-w-[220px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" formatter={(value, _name, item) => (
          <span className="flex w-full items-center justify-between gap-3">
            <span className="text-muted-foreground">{(item.payload as Slice).name}</span>
            <span className="font-medium tabular-nums text-foreground">{format(Number(value))}</span>
          </span>
        )} />} />
        <Pie data={slices} dataKey="yen" nameKey="key" innerRadius="58%" outerRadius="100%" stroke="var(--background)" strokeWidth={2} isAnimationActive onClick={(e) => onPick((e.payload as Slice).key)}>
          {slices.map((s) => <Cell key={s.key} fill={s.color} className="cursor-pointer outline-none" />)}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
