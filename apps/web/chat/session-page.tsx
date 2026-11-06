// 会話の画面（/s/:id。pages/[prefecture]/[name].tsx が描く）。会話の本体は conversation.tsx（自治体の個別ページの drawer と共有）。
// 会話は sessionStorage にしか無いので、サーバーは枠だけを書き、ブラウザで読んでから描く
import * as React from 'react'
import { Link } from '@void/react'
import { Conversation } from './conversation'
import { loadSession, type StoredSession } from './store'

// ロゴと頁の行き来はサイドバー（nav/）に置く。ここは上端のフェードの下地だけ
const header = <div className="h-6" />

function Expired() {
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p>この会話はこのブラウザに残っていないか、期限が切れました。会話は保存していないため、最初から聞き直してください。</p>
      <Link href="/" className="text-primary underline underline-offset-4">
        風土記のトップへ
      </Link>
    </div>
  )
}

export function SessionPage({ id }: { id: string }) {
  // undefined はまだ読んでいない（サーバーと最初の描画）、null は無い・期限切れ
  const [stored, setStored] = React.useState<StoredSession | null | undefined>(undefined)
  React.useEffect(() => {
    const s = loadSession(id)
    setStored(s && s.expiresAt * 1000 > Date.now() ? s : null)
  }, [id])
  return (
    <div id="chat-session">
      <noscript>会話には JavaScript を有効にしてください。</noscript>
      {stored === undefined ? null : stored ? <Conversation key={id} id={id} stored={stored} header={header} /> : <Expired />}
    </div>
  )
}
