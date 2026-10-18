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

async function loaded(timeoutMs = 15_000): Promise<Turnstile> {
  const start = Date.now()
  while (!window.turnstile) {
    if (Date.now() - start > timeoutMs) throw new Error('確認の部品を読み込めませんでした')
    await new Promise((r) => setTimeout(r, 100))
  }
  return window.turnstile
}

/** widget を置き、呼ぶたびに新しい token を返す関数を作る */
export async function mountTurnstile(el: HTMLElement, sitekey: string) {
  const turnstile = await loaded()
  let waiting: { resolve: (t: string) => void; reject: (e: Error) => void } | undefined
  const id = turnstile.render(el, {
    sitekey,
    action: 'chat-start',
    execution: 'execute',
    appearance: 'interaction-only',
    language: 'ja',
    callback: (token: string) => waiting?.resolve(token),
    'error-callback': () => waiting?.reject(new Error('確認に失敗しました。もう一度送ってください')),
    'expired-callback': () => turnstile.reset(id),
  })
  return {
    token: () =>
      new Promise<string>((resolve, reject) => {
        waiting = { resolve, reject }
        turnstile.reset(id)
        turnstile.execute(id)
      }),
    remove: () => turnstile.remove(id),
  }
}
