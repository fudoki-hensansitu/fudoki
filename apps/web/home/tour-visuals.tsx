// オンボーディングの小さな絵。答えを待つ間の点と、終わりの印。動きを減らす設定では、動かさずに終わりの様子だけを出す（onboarding.css の tv-*）
import * as React from 'react'

/** 答えを待つ間の3つの点 */
export function Typing() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="tv-dot size-1.5 rounded-full bg-primary" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  )
}

/** 終わりの印。丸を描いてから中に印を引く（1回だけ） */
export function DoneMark() {
  return (
    <span aria-hidden="true" className="relative grid size-10 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="size-10 text-primary">
        <circle className="tv-draw-ring" cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="2.5" pathLength="1" />
        <path className="tv-draw-check" d="M13 20.5l4.5 4.5L27 15.5" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
      </svg>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="tv-spark absolute size-1 rounded-full" style={{ '--a': `${i * 60}deg`, background: 'var(--kincha)' } as React.CSSProperties} />
      ))}
    </span>
  )
}
