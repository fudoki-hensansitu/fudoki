// 款 → 項 → 目 → 節 の流れ。帯の太さは金額に比例する。選んだ款だけ色を付け、他の款は灰色の帯で右へ消える。
// recharts の Sankey は他の款を節の位置まで伸ばしてしまうので、位置は自前で組む（金額は API の値、縮尺にだけ款の和を使う）
import * as React from 'react'
import { formatYen, type Drill, type Line } from './types'

const W = 900
const H = 430
const GAP = 9
const NW = 14
const KX = 170
const X1 = 372
const X2 = 548
const X3 = 716

const ribbon = (xa: number, ya: number, yb: number, xb: number, yc: number, yd: number) => {
  const m = (xa + xb) / 2
  return `M${xa} ${ya}C${m} ${ya},${m} ${yc},${xb} ${yc}L${xb} ${yd}C${m} ${yd},${m} ${yb},${xa} ${yb}Z`
}

export function Sankey({ kan, selectedId, drill, onSelect }: { kan: Line[]; selectedId: string; drill: Drill | null; onSelect: (id: string) => void }) {
  const total = kan.reduce((a, k) => a + k.yen, 0)
  const sc = (H - GAP * (kan.length - 1)) / total
  let y = 0
  const kans = kan.map((k) => {
    const o = { ...k, y, h: k.yen * sc }
    y += o.h + GAP
    return o
  })
  const sel = kans.find((k) => k.id === selectedId)
  const flows: React.ReactNode[] = []
  const nodes: React.ReactNode[] = []
  if (sel && drill && drill.kan.id === sel.id) {
    let ky = sel.y
    let koff = 0
    drill.kou.forEach((kou, i) => {
      const kh = kou.yen * sc
      flows.push(<path key={`k${i}`} d={ribbon(KX + NW, sel.y + koff, sel.y + koff + kh, X1, ky, ky + kh)} className="fill-primary/25" />)
      nodes.push(
        <g key={`kn${i}`}>
          <rect x={X1} y={ky} width={NW} height={Math.max(kh, 2)} rx={3} className="fill-primary" />
          <text x={X1} y={ky - 7} className="fill-foreground text-[12.5px]">
            {kou.name} <tspan className="fill-muted-foreground text-[11.5px]">{formatYen(kou.yen)}</tspan>
          </text>
        </g>,
      )
      let moff = 0
      let my = ky
      let sy = ky
      kou.moku.forEach((m, j) => {
        const mh = m.yen * sc
        flows.push(<path key={`m${i}-${j}`} d={ribbon(X1 + NW, ky + moff, ky + moff + mh, X2, my, my + mh)} className="fill-primary/25" />)
        nodes.push(
          <g key={`mn${i}-${j}`}>
            <rect x={X2} y={my} width={NW} height={Math.max(mh, 2)} rx={3} className="fill-primary" />
            <text x={X2} y={my - 7} className="fill-foreground text-[12.5px]">
              {m.name} <tspan className="fill-muted-foreground text-[11.5px]">{formatYen(m.yen)}</tspan>
            </text>
          </g>,
        )
        let soff = 0
        m.setsu.forEach((s, k) => {
          const sh = Math.max(s.yen * sc, 3)
          flows.push(<path key={`s${i}-${j}-${k}`} d={ribbon(X2 + NW, my + soff, my + soff + Math.max(s.yen * sc, 1.5), X3, sy, sy + sh)} className="fill-primary/25" />)
          nodes.push(
            <g key={`sn${i}-${j}-${k}`}>
              <rect x={X3} y={sy} width={NW} height={sh} rx={3} className="fill-primary" />
              <text x={X3 + NW + 8} y={sy + sh / 2 + 4} className="fill-muted-foreground text-[11.5px]">
                {s.name} {formatYen(s.yen)}
              </text>
            </g>,
          )
          soff += s.yen * sc
          sy += sh + 15
        })
        moff += mh
        my += mh + 38
        sy += 14
      })
      koff += kh
      ky += kh + 38
    })
  }
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <svg viewBox={`0 -40 ${W} ${H + 50}`} role="img" aria-label="歳出の款から節への流れ" className="block h-auto w-full min-w-[700px] overflow-visible font-sans">
        <defs>
          {kans.map((k, i) => (
            <linearGradient key={k.id} id={`sk-fade-${i}`} x1="0" x2="1">
              <stop offset="0" stopColor="var(--muted-foreground)" stopOpacity=".35" />
              <stop offset="1" stopColor="var(--muted-foreground)" stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {['款', '項', '目', '節（内訳）'].map((t, i) => (
          <text key={t} x={[KX + NW, X1, X2, X3][i]} y={-30} textAnchor={i === 0 ? 'end' : 'start'} className="fill-muted-foreground text-[11px]">
            {t}
          </text>
        ))}
        {kans.map((k, i) => (k.id === selectedId ? null : <rect key={`f${k.id}`} x={KX + NW} y={k.y} width={150} height={k.h} fill={`url(#sk-fade-${i})`} />))}
        <g>{flows}</g>
        {nodes}
        {kans.map((k) => {
          const on = k.id === selectedId
          const ty = k.y + Math.min(k.h / 2, 18)
          return (
            <g key={k.id} role="button" tabIndex={0} aria-label={`${k.name} ${formatYen(k.yen)}`} aria-pressed={on} className="cursor-pointer outline-none [&:focus-visible>.hit]:stroke-ring [&:focus-visible>.hit]:stroke-2" onClick={() => onSelect(k.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(k.id))}>
              <rect className="hit fill-transparent" x={0} y={k.y - 4} width={KX + NW + 4} height={k.h + GAP} rx={6} />
              <rect x={KX} y={k.y} width={NW} height={k.h} rx={3} className={on ? 'fill-primary' : 'fill-muted-foreground/60 hover:fill-foreground'} />
              <title>{`${k.name} ${formatYen(k.yen)}`}</title>
              {k.h >= 11 ? (
                <text x={KX - 10} y={ty + (k.h > 34 ? -3 : 4)} textAnchor="end" className="fill-foreground text-[12.5px]">
                  {k.name}
                </text>
              ) : null}
              {k.h > 34 ? (
                <text x={KX - 10} y={ty + 13} textAnchor="end" className="fill-muted-foreground text-[11.5px]">
                  {formatYen(k.yen)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
