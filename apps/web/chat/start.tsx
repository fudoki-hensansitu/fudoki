// 入口の1枚の中央に置く入力（React の島）。送ると Turnstile で確かめて会話を始め、/s/:id へ移る
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Composer } from './composer'
import { saveSession } from './store'
import { mountTurnstile } from './turnstile'

const SUGGESTIONS = ['中野区の2024年度の決算で、一番大きい款は？', '杉並区と練馬区の教育費を比べて']

function Start({ sitekey }: { sitekey: string }) {
  const widget = React.useRef<HTMLDivElement>(null)
  const turnstile = React.useRef<Awaited<ReturnType<typeof mountTurnstile>>>(undefined)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    if (!sitekey || !widget.current) return
    let removed = false
    mountTurnstile(widget.current, sitekey)
      .then((t) => (removed ? t.remove() : (turnstile.current = t)))
      .catch((e: Error) => setError(e.message))
    return () => {
      removed = true
      turnstile.current?.remove()
    }
  }, [sitekey])

  const start = async (text: string) => {
    setPending(true)
    setError(undefined)
    try {
      if (!turnstile.current) throw new Error('確認の準備ができていません。少し待ってから送ってください')
      const turnstileToken = await turnstile.current.token()
      const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnstileToken }) })
      const body = (await res.json()) as { id?: string; token?: string; expiresAt?: number; error?: { message: string } }
      if (!res.ok || !body.id || !body.token) throw new Error(body.error?.message ?? '会話を始められませんでした')
      // 移った先は sessionStorage から token と質問を読むので、書けなければ移らない
      if (!saveSession(body.id, { token: body.token, expiresAt: body.expiresAt ?? 0, pending: text }))
        throw new Error('このブラウザでは会話を保存できないため始められません（プライベートブラウズや保存の制限を確かめてください）')
      location.assign(`/s/${body.id}`)
      return true
    } catch (e) {
      setPending(false)
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  if (!sitekey)
    return <p className="text-sm text-muted-foreground">風土記の AI に聞く機能は準備中です。下の「自分の AI に接続する」から、お使いの AI で使えます。</p>
  return (
    <div className="flex flex-col gap-3">
      <Composer onSubmit={start} pending={pending} placeholder="街のお金について聞く" />
      <div ref={widget} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        例:{' '}
        {SUGGESTIONS.map((s, i) => (
          <React.Fragment key={s}>
            {i ? '／' : ''}
            {s}
          </React.Fragment>
        ))}
        。会話は保存しません。
      </p>
    </div>
  )
}

const root = document.getElementById('chat-start')
if (root) createRoot(root).render(<Start sitekey={root.dataset.turnstileSitekey ?? ''} />)
