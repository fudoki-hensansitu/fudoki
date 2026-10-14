import { useState } from 'react'
import { barWidths, percent, shortYen, yen } from './types'
import { Button } from '@fudoki/ui/components/button'
import { ChevronRight } from 'lucide-react'
import { Kind } from './kind'

export interface Bar {
  key: string
  label: string
  kind?: string
  /** 団体・年度など、行ごとに違うときだけ出す補足 */
  note?: string
  amount: number | null
  onSelect?: () => void
}

export const FOLD = 10

/**
 * 金額を横棒の長さで見せる。割合を出す兄弟の一覧では、棒も合計に対する比にして、% と長さを一致させる。
 * 割合を出さない一覧（団体・年度の混在、続きがある）では合計が意味を持たないので、最大の行に対する長さにする。
 */
export function BarList({ bars, share, busy, label, keepOrder = false, fold = FOLD }: {
  bars: Bar[]
  /** 年の推移など、並び自体に意味があるときは金額で並べ替えない */
  keepOrder?: boolean
  fold?: number
  share: boolean
  busy: boolean
  label: string
}) {
  const [limit, setLimit] = useState(fold)
  const sorted = keepOrder ? bars : [...bars].sort((a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity))
  const positive = sorted.map((b) => b.amount ?? 0).filter((v) => v > 0)
  const total = positive.reduce((sum, v) => sum + v, 0)
  const lengths = barWidths(sorted.map((b) => b.amount), share)
  const widths = new Map(sorted.map((bar, i) => [bar, lengths[i]!]))
  // 取得した件数によらず、最初は fold 件だけ出し、もっと見るで fold 件ずつ足す
  const shown = sorted.slice(0, limit)
  const hidden = sorted.slice(shown.length)
  return (
    <div className="bars" role="list" aria-label={label}>
      {shown.map((bar) => {
        const width = widths.get(bar)!
        const body = (
          <>
            <span className="bar-label">
              <span className="bar-name">{bar.kind && <Kind kind={bar.kind} />}{bar.label}{bar.onSelect && <ChevronRight className="bar-chevron" aria-hidden="true" />}</span>
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
        <Button variant="link" className="bar-more" onClick={() => setLimit(limit + fold)}>
          もっと見る（残り{hidden.length}件{share && total > 0
            ? ` · ${percent(hidden.reduce((sum, b) => sum + Math.max(0, b.amount ?? 0), 0) / total)}`
            : ''}）
        </Button>
      )}
    </div>
  )
}
