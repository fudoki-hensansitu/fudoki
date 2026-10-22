// 全款を同じ深さで描く。科目間の余白を別に取り、帯の太さは全列で同じ金額の縮尺にする。
import * as React from 'react'
import { formatYen, type Drill, type FlowDepth } from './types'

const GAP = 24
const NODE_WIDTH = 12
const COLUMN_WIDTH = 300
const LABELS = ['款', '項', '目', '節・事業内訳']

interface FlowNode {
  key: string
  name: string
  yen: number
  column: number
  children: FlowNode[]
  height: number
  span: number
  y: number
}

const ribbon = (xa: number, ya: number, height: number, xb: number, yb: number) => {
  const mid = (xa + xb) / 2
  return `M${xa} ${ya}C${mid} ${ya},${mid} ${yb},${xb} ${yb}L${xb} ${yb + height}C${mid} ${yb + height},${mid} ${ya + height},${xa} ${ya + height}Z`
}

export function Sankey({ flows, depth }: { flows: Drill[]; depth: FlowDepth }) {
  const columns = depth === 'kou' ? 2 : depth === 'moku' ? 3 : 4
  const total = flows.reduce((sum, flow) => sum + Math.max(0, flow.kan.yen), 0)
  const scale = total ? 360 / total : 0
  const make = (key: string, name: string, yen: number, column: number, children: FlowNode[]): FlowNode => {
    const height = Math.max(0, yen) * scale
    const childSpan = children.reduce((sum, child) => sum + child.span, 0) + Math.max(0, children.length - 1) * GAP
    return { key, name, yen, column, children, height, span: Math.max(height, childSpan, 30), y: 0 }
  }
  const roots = flows.map(({ kan, kou }) => make(kan.id, kan.name, kan.yen, 0,
    kou.map((k) => make(k.id, k.name, k.yen, 1, columns > 2
      ? k.moku.map((m) => make(m.id, m.name, m.yen, 2, columns > 3
        ? m.setsu.map((s, i) => make(`${m.id}-${i}`, s.name, s.yen, 3, []))
        : []))
      : []))))
  const nodes: FlowNode[] = []
  const bands: React.ReactNode[] = []
  const x = (column: number) => 220 + column * COLUMN_WIDTH
  const position = (node: FlowNode, top: number) => {
    node.y = top + (node.span - node.height) / 2
    nodes.push(node)
    let childTop = top
    let sourceOffset = 0
    for (const child of node.children) {
      position(child, childTop)
      if (child.height > 0) bands.push(<path key={child.key} d={ribbon(x(node.column) + NODE_WIDTH, node.y + sourceOffset, child.height, x(child.column), child.y)} className="fill-primary/20" />)
      sourceOffset += child.height
      childTop += child.span + GAP
    }
  }
  let top = 24
  for (const root of roots) {
    position(root, top)
    top += root.span + GAP
  }
  const width = columns * COLUMN_WIDTH
  const height = Math.max(180, top)
  return (
    <div className="max-h-[720px] overflow-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" tabIndex={0} role="region" aria-label="お金の流れの図">
      <div className="sticky top-0 z-10 grid border-b bg-background py-2 text-xs text-muted-foreground" style={{ width, gridTemplateColumns: `repeat(${columns}, ${COLUMN_WIDTH}px)` }}>
        {LABELS.slice(0, columns).map((label) => <span key={label} className="px-4">{label}</span>)}
      </div>
      <svg width={width} height={height} role="img" aria-label={`${LABELS.slice(0, columns).join('から')}への歳出の流れ`} className="block max-w-none font-sans">
        {bands}
        {nodes.map((node) => {
          const center = node.y + node.height / 2
          const chars = Array.from(node.name)
          const label = chars.length > 15 ? `${chars.slice(0, 14).join('')}…` : node.name
          return (
            <g key={node.key}>
              <title>{`${node.name} ${formatYen(node.yen)}`}</title>
              <rect x={x(node.column)} y={node.y} width={NODE_WIDTH} height={Math.max(node.height, 2)} rx={2} className={node.yen > 0 ? 'fill-primary' : 'fill-muted-foreground'} />
              <text x={x(node.column) - 10} y={center - 3} textAnchor="end" className="fill-foreground text-[12.5px]" stroke="var(--background)" strokeWidth={4} paintOrder="stroke">{label}</text>
              <text x={x(node.column) - 10} y={center + 13} textAnchor="end" className="fill-muted-foreground text-[11.5px]" stroke="var(--background)" strokeWidth={4} paintOrder="stroke">{formatYen(node.yen)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
