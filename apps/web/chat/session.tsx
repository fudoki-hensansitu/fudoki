// 会話の画面（/s/:id）。会話の本体は conversation.tsx（自治体の個別ページの drawer と共有）
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { SquarePenIcon } from 'lucide-react'
import { Conversation } from './conversation'
import { loadSession } from './store'
import { LOGO_G } from '../logo'

const header = (
  <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
    <a href="/" aria-label="風土記 ホーム" className="text-primary">
      <svg className="block h-7 w-auto" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 146.2150 40" role="img" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
    </a>
    <a href="/" aria-label="新しい会話" title="新しい会話" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
      <SquarePenIcon className="size-5" />
    </a>
  </header>
)

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
