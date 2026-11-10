// 会話を始める入力（入口・アシスタント・自治体の個別ページが使う）。送ると Turnstile で確かめて会話を作り、/s/:id へ移る
import * as React from 'react'
import { useRouter } from '@void/react'
import { Composer } from './composer'
import { MAX_CONTEXT } from './history'
import { saveSession, type StoredSession } from './store'
import { mountTurnstile } from './turnstile'

export function StartForm({
  sitekey,
  placeholder,
  prefix = '',
  suggestions = [],
  unavailable = '風土記の AI に聞く機能は準備中です。',
  context,
  onStart,
  before,
  after,
}: {
  sitekey: string
  placeholder: string
  /** 質問の前に付ける文脈（例: 自治体名）。会話の最初の質問に含めて AI に渡す */
  prefix?: string
  /** 押すとその質問で会話を始める候補 */
  suggestions?: string[]
  /** Turnstile の鍵が無いとき入力の代わりに出す文 */
  unavailable?: string
  /** 送るときに読む、画面で見ているもの（質問とは別の利用者の発言として AI に渡す） */
  context?: () => string | undefined
  /** 渡すと /s/:id へ移らず、始めた会話をその場で開く */
  onStart?: (id: string, session: StoredSession) => void
  /** 入力欄の上に出すもの（選んだ文など） */
  before?: React.ReactNode
  /** 入力欄の下に出すもの。渡す start でその質問の会話を始める（アシスタントの頁の例のカードなど） */
  after?: (start: (text: string) => Promise<boolean>, pending: boolean) => React.ReactNode
}) {
  const router = useRouter()
  const widget = React.useRef<HTMLDivElement>(null)
  const turnstile = React.useRef<Awaited<ReturnType<typeof mountTurnstile>>>(undefined)
  const [pending, setPending] = React.useState(false)
  const [challenge, setChallenge] = React.useState(false)
  const [error, setError] = React.useState<string>()
  React.useEffect(() => {
    if (!sitekey || !widget.current) return
    let removed = false
    mountTurnstile(widget.current, sitekey, setChallenge)
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
    // 会話の本体は lazy に読むので、Turnstile と POST を待つ間に取り始めておく（移った先・drawer の lazy はこれを使う）
    void import('./conversation').catch(() => {})
    try {
      if (!turnstile.current) throw new Error('確認の準備ができていません。少し待ってから送ってください')
      const turnstileToken = await turnstile.current.token()
      const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnstileToken }) })
      const body = (await res.json()) as { id?: string; token?: string; expiresAt?: number; error?: { message: string } }
      if (!res.ok || !body.id || !body.token) throw new Error(body.error?.message ?? '会話を始められませんでした')
      const pendingContext = context?.()?.slice(0, MAX_CONTEXT)
      const session: StoredSession = { token: body.token, expiresAt: body.expiresAt ?? 0, pending: prefix ? `${prefix}${text}` : text, entry: location.pathname, ...(pendingContext ? { pendingContext } : {}) }
      // 移った先は sessionStorage から token と質問を読むので、書けなければ移らない
      if (!saveSession(body.id, session))
        throw new Error('このブラウザでは会話を保存できないため始められません（プライベートブラウズや保存の制限を確かめてください）')
      if (onStart) {
        setPending(false)
        onStart(body.id, session)
        return true
      }
      // 頁を読み直さずに移る（サイドバーはそのまま）
      await router.visit(`/s/${body.id}`)
      return true
    } catch (e) {
      setPending(false)
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  if (!sitekey)
    return <p className="text-sm text-muted-foreground">{unavailable}</p>
  return (
    <div className="ask-dock flex flex-col">
      {suggestions.length > 0 ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {suggestions.map((q) => (
            <button key={q} type="button" disabled={pending} onClick={() => void start(q)} className="shrink-0 rounded-full border bg-background px-3.5 py-1.5 text-[13px] transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
      ) : null}
      {before}
      <Composer onSubmit={start} pending={pending} placeholder={placeholder} onFocus={() => turnstile.current?.warm()} />
      <div ref={widget} className={challenge ? 'mt-3 flex justify-center' : 'hidden'} />
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {after?.(start, pending)}
    </div>
  )
}
