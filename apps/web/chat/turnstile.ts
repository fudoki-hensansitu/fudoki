// Turnstile の widget（入口の頁が api.js?render=explicit を読む）。送るときに実行して token を1つ取る
interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string
  execute(id: string): void
  reset(id: string): void
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

/** 先に取った token を使い回せる時間。token は約5分で切れるので、余裕を見て4分 */
const WARM_TTL_MS = 240_000

async function loaded(timeoutMs = 15_000): Promise<Turnstile> {
  const start = Date.now()
  while (!window.turnstile) {
    if (Date.now() - start > timeoutMs) throw new Error('確認の部品を読み込めませんでした')
    await new Promise((r) => setTimeout(r, 100))
  }
  return window.turnstile
}

/** widget を置き、呼ぶたびに新しい token を返す関数を作る */
export async function mountTurnstile(el: HTMLElement, sitekey: string, onInteractive?: (visible: boolean) => void) {
  const turnstile = await loaded()
  let waiting: { resolve: (t: string) => void; reject: (e: Error) => void } | undefined
  // 決着した後に遅れて届いた callback は無視する
  const settle = (outcome: { token: string } | { error: string }) => {
    const w = waiting
    waiting = undefined
    if (!w) return
    if ('token' in outcome) w.resolve(outcome.token)
    else w.reject(new Error(outcome.error))
  }
  const id = turnstile.render(el, {
    sitekey,
    action: 'chat-start',
    execution: 'execute',
    appearance: 'interaction-only',
    language: 'ja',
    // 操作を求められたときだけ widget を見せる。終わったら（成功の表示も含め）畳む
    'before-interactive-callback': () => onInteractive?.(true),
    'after-interactive-callback': () => onInteractive?.(false),
    callback: (token: string) => {
      onInteractive?.(false)
      settle({ token })
    },
    'error-callback': () => settle({ error: '確認に失敗しました。もう一度送ってください' }),
    // 操作を求める確認に時間内に答えなかった・token が期限切れになったときも、待っている送信を終わらせる
    'timeout-callback': () => settle({ error: '確認の時間が切れました。もう一度送ってください' }),
    'expired-callback': () => {
      settle({ error: '確認の期限が切れました。もう一度送ってください' })
      turnstile.reset(id)
    },
  })
  // 走っている確認の間は、新しく走らせて待っている側（waiting）を差し替えない
  let running = false
  const run = () =>
    new Promise<string>((resolve, reject) => {
      running = true
      waiting = { resolve, reject }
      turnstile.reset(id)
      turnstile.execute(id)
    }).finally(() => {
      running = false
    })
  // 入力を始めた時点で確認を先に走らせ、送るときに待たないようにする（token は約5分で切れるので、4分を超えたら取り直す）
  let warm: { promise: Promise<string>; at: number } | undefined
  const fresh = () => (warm && Date.now() - warm.at < WARM_TTL_MS ? warm : undefined)
  return {
    warm: () => {
      if (fresh() || running) return
      const promise = run()
      warm = { promise, at: Date.now() }
      promise.catch(() => {
        if (warm?.promise === promise) warm = undefined
      })
    },
    token: () => {
      const ready = fresh()?.promise
      // token は1回しか使えない。使ったら捨てる
      warm = undefined
      return ready ?? run()
    },
    remove: () => turnstile.remove(id),
  }
}
