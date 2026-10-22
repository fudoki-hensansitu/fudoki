// 入口の1枚の中央に置く入力（React の島）。送ると Turnstile で確かめて会話を始め、/s/:id へ移る
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { StartForm } from './start-form'

/** 入力の placeholder に置く問いの例。幅390px の pill でも切れない長さにする */
const EXAMPLE = '例：中野区で一番お金を使った分野は？'
const UNAVAILABLE = '風土記の AI に聞く機能は準備中です。下の「自分の AI に接続する」から、お使いの AI で使えます。'

const root = document.getElementById('chat-start')
if (root) {
  const sitekey = root.dataset.turnstileSitekey ?? ''
  createRoot(root).render(<StartForm sitekey={sitekey} placeholder={EXAMPLE} unavailable={UNAVAILABLE} />)
  // 入力が出ない（鍵が無い）ときは固定する物が無いので、下余白も足さない
  if (sitekey)
    // 元の位置が画面の上へ出たら下に固定する。下に外れている（まだ読んでいない）間は動かさない
    {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)')
      let leave: ReturnType<typeof setTimeout> | undefined
      new IntersectionObserver(([entry]) => {
        if (!entry) return
        const docked = !entry.isIntersecting && entry.boundingClientRect.top < 0
        const was = root.hasAttribute('data-docked')
        clearTimeout(leave)
        root.removeAttribute('data-leaving')
        root.toggleAttribute('data-docked', docked)
        document.body.classList.toggle('ask-docked', docked)
        // 元の位置へ戻るときは、固定のまま小さく消えてから流れに戻す（動きを減らす設定では即座に戻す）
        if (was && !docked && !reduced.matches) {
          root.setAttribute('data-leaving', '')
          leave = setTimeout(() => root.removeAttribute('data-leaving'), 200)
        }
      }).observe(root)
    }
}
