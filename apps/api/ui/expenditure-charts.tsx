import { useState } from 'react'
import { Pie, PieChart, Sector, type PieSectorShapeProps, type PieLabelRenderProps } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@fudoki/ui/components/chart'
import { Button } from '@fudoki/ui/components/button'
import { NativeSelect, NativeSelectOption } from '@fudoki/ui/components/native-select'
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@fudoki/ui/components/table'
import { KIND_LABEL, yen, type TreeNode } from './types'

export function chartGroups(rows: TreeNode[]) {
  const groups = new Map<string, { rows: TreeNode[]; ids: Set<string> }>()
  for (const row of rows) {
    // 原典の同じ親・軸・段に属する兄弟だけを一つの円にする。親と子を足さない。
    if (!['款', '項', '目'].includes(row.node_kind) || row.is_subject === false ||
        row.axis !== '科目' || row.parent_node_id === undefined ||
        (row.node_kind !== '款' && row.parent_node_id === null)) continue
    const key = JSON.stringify([row.document_kind, row.jurisdiction_code, row.fiscal_year,
      row.account_name, row.axis, row.node_kind, row.parent_node_id])
    const group = groups.get(key) ?? { rows: [], ids: new Set<string>() }
    // 追加ページに同じ明細があっても二重の扇形にしない。
    if (!group.ids.has(row.node_id)) {
      group.rows.push(row)
      group.ids.add(row.node_id)
    }
    groups.set(key, group)
  }
  return [...groups].map(([key, { rows }]) => ({ key, rows }))
    .sort((a, b) => ['款', '項', '目'].indexOf(a.rows[0]!.node_kind) - ['款', '項', '目'].indexOf(b.rows[0]!.node_kind))
}

export function ExpenditureCharts({ rows, partial, busy, selectedId, showScope = true, onSelect }: {
  rows: TreeNode[]
  partial: boolean
  busy: boolean
  selectedId?: string
  showScope?: boolean
  onSelect: (node: TreeNode) => void
}) {
  const groups = chartGroups(rows)
  const [groupKey, setGroupKey] = useState('')
  const group = groups.find((g) => g.key === groupKey) ?? groups.find((g) => g.rows.some((n) => n.node_id === selectedId)) ?? groups[0]
  if (!group) return null
  const first = group.rows[0]!
  const invalid = group.rows.some((n) => n.amount_yen === null ||
    !Number.isSafeInteger(n.amount_yen) || n.amount_yen < 0)
  const items = group.rows.map((node, index) => ({
    name: node.name, amount: node.amount_yen, node, number: index + 1,
    fill: `var(--expenditure-${index % 12 + 1})`,
  }))
  const data = items.filter((item) => item.amount !== null && item.amount > 0)
  const heading = first.node_kind === '款' ? '款別の金額'
    : `${first.node_kind === '項' ? first.kan_name : first.kou_name ?? first.kan_name} / ${first.node_kind}`
  return (
    <section className="expenditure-panel" aria-label={`${first.node_kind}の金額`}>
      <h4>{heading}</h4>
      {showScope && <div className="text-muted-foreground small">
        {first.jurisdiction_code} ・ {first.fiscal_year}年度{' '}
        {KIND_LABEL[first.document_kind]} ・ {first.account_name}
      </div>}
      {groups.length > 1 && (
        <NativeSelect aria-label="金額の表示範囲" value={group.key}
          onChange={(event) => setGroupKey(event.target.value)}>
          {groups.map((g) => {
            const n = g.rows[0]!
            return <NativeSelectOption key={g.key} value={g.key}>
              {n.jurisdiction_code} / {n.fiscal_year} / {KIND_LABEL[n.document_kind]} / {n.account_name} / {n.node_kind} / {n.kan_name}{n.kou_name && ` / ${n.kou_name}`}
            </NativeSelectOption>
          })}
        </NativeSelect>
      )}
      {partial && <p className="text-muted-foreground small">
        取得済みの明細内の割合です。続きを取得すると変わります。
      </p>}
      <div className="expenditure-visual">
        {!invalid && data.length > 0 ? (
          <ChartContainer config={{ amount: { label: '金額' } }} className="expenditure-pie">
            <PieChart accessibilityLayer>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel
                formatter={(value, _name, item) => <span>{item.payload.name}　{yen(Number(value))}</span>} />} />
              <Pie data={data} dataKey="amount" nameKey="name" innerRadius="55%"
                outerRadius="85%" isAnimationActive={false} labelLine={false}
                label={({ cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, index }: PieLabelRenderProps) => {
                  // 小さい扇形は番号を詰め込まず、常時表示する凡例から読めるようにする。
                  if (Math.abs(Number(endAngle) - Number(startAngle)) < 14) return null
                  const angle = -Number(midAngle) * Math.PI / 180
                  const radius = (Number(innerRadius) + Number(outerRadius)) / 2
                  return <text className="expenditure-label"
                    x={Number(cx) + radius * Math.cos(angle)} y={Number(cy) + radius * Math.sin(angle)}
                    textAnchor="middle" dominantBaseline="central" fill="var(--expenditure-label)"
                    pointerEvents="none">{data[index]?.number}</text>
                }}
                onClick={(_value, index) => { if (!busy && data[index]) onSelect(data[index]!.node) }}
                shape={(props: PieSectorShapeProps) => <Sector {...props}
                  stroke={props.payload.node.node_id === selectedId ? 'var(--foreground)' : 'var(--background)'}
                  strokeWidth={props.payload.node.node_id === selectedId ? 3 : 1} />}
              />
            </PieChart>
          </ChartContainer>
        ) : <p className="text-muted-foreground small">
          {invalid ? '金額が不明、負数、または正確に扱えない明細を含むため、表で表示します。' : '正の金額がないため、表で表示します。'}
        </p>}
        <Table>
          <TableHeader><TableRow><TableHead>{first.node_kind}</TableHead><TableHead className="num">金額</TableHead></TableRow></TableHeader>
          <TableBody>{items.map(({ node, number, fill }) => (
            <TableRow key={node.node_id} data-selected={node.node_id === selectedId || undefined}>
              <TableCell>
                <div className="expenditure-key">
                {!invalid && node.amount_yen !== null && node.amount_yen > 0 &&
                  <span className="expenditure-marker" aria-hidden="true" style={{ background: fill }}>{number}</span>}
                <Button variant="link" size="sm" disabled={busy} aria-label={`内訳: ${node.name}`}
                  aria-pressed={node.node_id === selectedId} onClick={() => onSelect(node)}>{node.name}</Button>
                </div>
              </TableCell>
              <TableCell className="num">{yen(node.amount_yen)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </section>
  )
}
