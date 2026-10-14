import { useState } from 'react'
import { percent, shortYen, yen } from './types'

export interface Bar {
  key: string
  label: string
  /** 団体・年度など、行ごとに違うときだけ出す補足 */
  note?: string
  amount: number | null
  onSelect?: () => void
}

const FOLD = 10

/**
 * 金額を横棒の長さで見せる。棒は最大の行に対する長さ、割合は合計に対する比。
 * 割合は同じ親の兄弟だけで意味を持つので、share を渡したときだけ出す。
 */
export function BarList({ bars, share, busy, label }: {
  bars: Bar[]
  share: boolean
  busy: boolean
  label: string
}) {
  const [open, setOpen] = useState(false)
  const sorted = [...bars].sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity))
  const positive = sorted.map((b) => b.amount ?? 0).filter((v) => v > 0)
  const max = Math.max(0, ...positive)
  const total = positive.reduce((sum, v) => sum + v, 0)
  // 畳むのは2件以上隠れるときだけ。1件のために「残り1件」を押させない。
  const shown = open || sorted.length <= FOLD + 1 ? sorted : sorted.slice(0, FOLD)
  const hidden = sorted.slice(shown.length)
  return (
    <div className="bars" role="list" aria-label={label}>
      {shown.map((bar) => {
        const width = bar.amount !== null && bar.amount > 0 && max > 0 ? (bar.amount / max) * 100 : 0
        const body = (
          <>
            <span className="bar-label">
              <span className="bar-name">{bar.label}</span>
              {bar.note && <span className="bar-note">{bar.note}</span>}
            </span>
            <span className="bar-figures">
              {share && total > 0 && bar.amount !== null && bar.amount > 0 && (
                <span className="bar-share">{percent(bar.amount / total)}</span>
              )}
              <span className="bar-amount" title={yen(bar.amount)}>{shortYen(bar.amount)}</span>
            </span>
            {sorted.length > 1 && (
              <span className="bar-track" aria-hidden="true">
                {width > 0 && <span className="bar-fill" style={{ width: `${width}%` }} />}
              </span>
            )}
          </>
        )
        return (
          <div role="listitem" key={bar.key}>
            {bar.onSelect ? (
              <button type="button" className="bar" disabled={busy} onClick={bar.onSelect}
                aria-label={`${bar.label} ${yen(bar.amount)}${bar.note ? ` ${bar.note}` : ''} の内訳を見る`}>
                {body}
              </button>
            ) : (
              <div className="bar">{body}</div>
            )}
          </div>
        )
      })}
      {hidden.length > 0 && (
        <button type="button" className="bar-more" onClick={() => setOpen(true)}>
          ほか{hidden.length}件（{share && total > 0
            ? percent(hidden.reduce((sum, b) => sum + Math.max(0, b.amount ?? 0), 0) / total)
            : shortYen(hidden.reduce((sum, b) => sum + Math.max(0, b.amount ?? 0), 0))}）を表示
        </button>
      )}
    </div>
  )
}
