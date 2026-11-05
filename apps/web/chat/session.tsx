// 会話の画面（/s/:id）。会話の本体は conversation.tsx（自治体の個別ページの drawer と共有）
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from './conversation'
import { loadSession } from './store'

// ロゴと頁の行き来はサイドバー（nav/）に置く。ここは上端のフェードの下地だけ
const header = <div className="h-6" />

function Expired() {
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p>この会話はこのブラウザに残っていないか、期限が切れました。会話は保存していないため、最初から聞き直してください。</p>
      <a href="/" className="text-primary underline underline-offset-4">風土記のトップへ</a>
    </div>
  )
}

const root = document.getElementById('chat-session')
const id = location.pathname.split('/').at(-1) ?? ''
const stored = loadSession(id)
if (root)
  createRoot(root).render(
    <React.StrictMode>{stored && stored.expiresAt * 1000 > Date.now() ? <Conversation id={id} stored={stored} header={header} /> : <Expired />}</React.StrictMode>,
  )
