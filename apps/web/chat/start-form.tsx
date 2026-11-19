// 会話を始める入力（入口・アシスタント・自治体の個別ページが使う）。送ると Turnstile で確かめて会話を作り、/s/:id へ移る
import * as React from 'react'
import { useRouter } from '@void/react'
import { Composer } from './composer'
import { MAX_CONTEXT } from './history'
import { saveSession, type StoredSession } from './store'
import { mountTurnstile } from './turnstile'

type Turnstile = Awaited<ReturnType<typeof mountTurnstile>>
/** Turnstile を置き終えるのを待つ上限 */
const MOUNT_WAIT_MS = 10_000

/** Turnstile を置き、それを通して server に会話（id・token）を作る。widget は確かめの操作が要るときだけ見せる */
function useSessionMaker(sitekey: string, onError: (message: string) => void) {
  const widget = React.useRef<HTMLDivElement>(null)
  const turnstile = React.useRef<Turnstile>(undefined)
  // 置き終える前に会話を作ろうとしたら、置き終えるのを待つ（作り置きの答えの会話は、開いてすぐ聞くことがある）
  const [mounted] = React.useState(() => {
    let resolve!: (t: Turnstile) => void
    const promise = new Promise<Turnstile>((r) => (resolve = r))
    return { promise, resolve }
  })
  const [challenge, setChallenge] = React.useState(false)
  const onErrorRef = React.useRef(onError)
  onErrorRef.current = onError
  React.useEffect(() => {
    if (!sitekey || !widget.current) return
    let removed = false
    mountTurnstile(widget.current, sitekey, setChallenge)
      .then((t) => {
        if (removed) return t.remove()
        turnstile.current = t
        mounted.resolve(t)
      })
      .catch((e: Error) => onErrorRef.current(e.message))
    return () => {
      removed = true
      turnstile.current?.remove()
    }
  }, [sitekey])
  const create = React.useCallback(async () => {
    const t = turnstile.current ?? (await Promise.race([mounted.promise, new Promise<undefined>((r) => setTimeout(r, MOUNT_WAIT_MS))]))
    if (!t) throw new Error('確認の準備ができていません。少し待ってから送ってください')
    const turnstileToken = await t.token()
    const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnstileToken }) })
    const body = (await res.json()) as { id?: string; token?: string; expiresAt?: number; error?: { message: string } }
    if (!res.ok || !body.id || !body.token) throw new Error(body.error?.message ?? '会話を始められませんでした')
    return { id: body.id, token: body.token, expiresAt: body.expiresAt ?? 0 }
  }, [mounted])
  const warm = () => turnstile.current?.warm()
  return { widget, challenge, create, warm }
}

/** 質問を送らずに会話だけを作る。作り置きの答えから始めた会話（自治体の頁の「気になる」）を、続けて聞くときに server の会話にする。
 * 会話の drawer の中に置き、確かめの操作が要るときはそこに widget を出す */
export function SessionVerifier({ sitekey, connectRef }: { sitekey: string; connectRef: React.RefObject<(() => Promise<{ id: string; session: StoredSession }>) | undefined> }) {
  const [error, setError] = React.useState<string>()
  const { widget, challenge, create } = useSessionMaker(sitekey, setError)
  React.useEffect(() => {
    connectRef.current = async () => {
      const made = await create()
      return { id: made.id, session: { token: made.token, expiresAt: made.expiresAt, entry: location.pathname } }
    }
    return () => void (connectRef.current = undefined)
  }, [connectRef, create])
  return (
    <>
      <div ref={widget} className={challenge ? 'mb-3 flex justify-center' : 'hidden'} />
      {error ? <p role="alert" className="mb-3 text-sm text-destructive">{error}</p> : null}
    </>
  )
}

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
  /** 送るときに読む、頁で見ているもの・選んだ文（選んだ文は質問の直前の利用者の発言に、見ている画面は最後の質問のものだけを system prompt に入れて AI に渡す） */
  context?: () => string | undefined
  /** 渡すと /s/:id へ移らず、始めた会話をその場で開く */
  onStart?: (id: string, session: StoredSession) => void
  /** 入力欄の上に出すもの（選んだ文など） */
  before?: React.ReactNode
  /** 入力欄の下に出すもの。渡す start でその質問の会話を始める（アシスタントの頁の例のカードなど） */
  after?: (start: (text: string) => Promise<boolean>, pending: boolean) => React.ReactNode
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const { widget, challenge, create, warm } = useSessionMaker(sitekey, setError)

  const start = async (text: string) => {
    setPending(true)
    setError(undefined)
    // 会話の本体は lazy に読むので、Turnstile と POST を待つ間に取り始めておく（移った先・drawer の lazy はこれを使う）
    void import('./conversation').catch(() => {})
    try {
      const body = await create()
      const pendingContext = context?.()?.slice(0, MAX_CONTEXT)
      const session: StoredSession = { token: body.token, expiresAt: body.expiresAt, pending: prefix ? `${prefix}${text}` : text, entry: location.pathname, ...(pendingContext ? { pendingContext } : {}) }
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
            <button key={q} type="button" disabled={pending} onClick={() => void start(q)} className="shrink-0 rounded-full border bg-background px-4 py-2 text-sm transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
      ) : null}
      {before}
      <Composer onSubmit={start} pending={pending} placeholder={placeholder} onFocus={warm} />
      <div ref={widget} className={challenge ? 'mt-3 flex justify-center' : 'hidden'} />
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {after?.(start, pending)}
    </div>
  )
}
