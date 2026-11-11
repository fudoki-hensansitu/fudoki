// 試作のピッカー（prototype skill の PICKER.md の振る舞い）。1〜N・←→で切り替え、R で描き直す。「最初から」は試作の保存を消してはじめての画面に戻す。選んだ案は variant.ts が持つ
import * as React from 'react'
import './picker.css'
import { resetProto } from './towns'
import { useVariant, VARIANTS } from './variant'

export function Picker() {
  const { current, select, replay } = useVariant()
  const names = VARIANTS
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      // ボタン・リンク・タブの上の矢印は、その部品の操作に任せる
      if (e.key.startsWith('Arrow') && t.closest('button, a, [role="tab"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= names.length) select(num - 1)
      else if (e.key === 'ArrowRight') select((current + 1) % names.length)
      else if (e.key === 'ArrowLeft') select((current - 1 + names.length) % names.length)
      else if (e.key === 'r' || e.key === 'R') replay()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [current, names, select, replay])
  const nav = React.useRef<HTMLElement>(null)
  const items = React.useRef<(HTMLButtonElement | null)[]>([])
  const highlight = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const move = () => {
      const el = items.current[current]
      if (!el || !highlight.current) return
      highlight.current.style.width = `${el.offsetWidth}px`
      highlight.current.style.transform = `translateX(${el.offsetLeft}px)`
    }
    move()
    window.addEventListener('resize', move)
    return () => window.removeEventListener('resize', move)
  }, [current])
  React.useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => nav.current?.setAttribute('data-ready', '')))
  }, [])
  return (
    <nav ref={nav} className="proto-picker" aria-label="Prototype variants" data-position="top">
      <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
      {names.map((n, i) => (
        <button key={n} ref={(el) => void (items.current[i] = el)} className="proto-picker-item" data-active={i === current ? '' : undefined} aria-current={i === current ? 'true' : undefined} onClick={() => select(i)}>
          {n}
        </button>
      ))}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={replay}>
        ↻
      </button>
      {/* 選んだまち・チェックリストを消して、はじめて開いた画面から見直す */}
      <button className="proto-picker-item" onClick={() => (resetProto(), window.location.assign('/prototype'))}>
        最初から
      </button>
    </nav>
  )
}
