// 会話の画面（/s/:id。pages/[prefecture]/[name].tsx が描く）。会話の本体は conversation.tsx（自治体の個別ページの drawer と共有）。
// 会話は sessionStorage にしか無いので、サーバーは枠だけを書き、ブラウザで読んでから描く
import * as React from 'react'
import { Link } from '../nav/link'
import { Button } from '@/components/ui/button'
import { loadSession, type StoredSession } from './store'

// 会話の本体（AI SDK など）は重いので、この頁で会話を描く時だけ読む。同じ route（/:prefecture/:name）の自治体の頁へ移る時に一緒に読まないようにする
const Conversation = React.lazy(() => import('./conversation').then((m) => ({ default: m.Conversation })))

// ロゴと頁の行き来はサイドバー（nav/）に置く。ここは上端のフェードの下地だけ
const header = <div className="h-6" />

function Expired() {
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p>この会話はこのブラウザに残っていないか、期限が切れました。会話は保存していないため、最初から聞き直してください。</p>
      <Button variant="link" size="inline" nativeButton={false} render={<Link href="/" />}>
        風土記のトップへ
      </Button>
    </div>
  )
}

export function SessionPage({ id }: { id: string }) {
  // 読んだ会話をその id と組で持つ。別の会話へ移った直後（前の id の値が残っている間）はまだ読んでいない扱いにする。
  // session が undefined はまだ読んでいない（サーバーと最初の描画）、null は無い・期限切れ
  const [loaded, setLoaded] = React.useState<{ id: string; session: StoredSession | null }>()
  React.useEffect(() => {
    const s = loadSession(id)
    setLoaded({ id, session: s && s.expiresAt * 1000 > Date.now() ? s : null })
  }, [id])
  const stored = loaded?.id === id ? loaded.session : undefined
  return (
    <div id="chat-session">
      <noscript>会話には JavaScript を有効にしてください。</noscript>
      {stored === undefined ? null : stored ? (
        <React.Suspense fallback={null}>
          <Conversation key={id} id={id} stored={stored} header={header} movableViews />
        </React.Suspense>
      ) : (
        <Expired />
      )}
    </div>
  )
}
