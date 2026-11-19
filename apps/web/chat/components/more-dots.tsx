// 一覧の末尾に置く「続きを読む」印。見えそうになったら onVisible を呼ぶだけで、続きを取るのは呼び出し側。
// 一覧は全部を手元に取らず、この印で少しずつ足す（事業の一覧・まちを探す・まち比べの候補など）。
// 候補の窓のように一覧そのものが scroll するときは、その窓を基準に見えるかを測る
import * as React from 'react'

/** いちばん近い、縦に scroll する祖先。無ければ画面（null） */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if (y === 'auto' || y === 'scroll') return p
  }
  return null
}

/** key を変えると印を置き直す（読み終えた・読めなかったあと、見えたままなら、もう一度呼ぶ） */
export function MoreDots({ onVisible }: { onVisible: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef(onVisible)
  latest.current = onVisible
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = scrollParent(el)
    // 画面なら少し手前、窓の中なら窓の高さの分だけ手前で読み始める
    const io = new IntersectionObserver(([e]) => e!.isIntersecting && latest.current(), { root, rootMargin: root ? '100% 0px' : '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="flex justify-center gap-2 py-5" aria-hidden="true">
      {[0, 1, 2].map((i) => <span key={i} className="app-dot size-1.5 rounded-full bg-border" style={{ animationDelay: `${i * 150}ms` }} />)}
    </div>
  )
}
