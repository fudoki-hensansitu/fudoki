// 試作: ホームとサイドバーの案。サイドバーとホームが同じ案を読むので、ブラウザに置いて window に知らせる。?v= で開いたらそれを使う
import * as React from 'react'

export const VARIANTS = ['うちのまち', 'さがす', 'まちの中']
const KEY = 'fudoki:proto-variant'
const EVENT = 'fudoki:proto-variant'

const read = () => {
  const fromUrl = parseInt(new URLSearchParams(location.search).get('v') ?? '', 10)
  if (fromUrl >= 1 && fromUrl <= VARIANTS.length) return fromUrl - 1
  try {
    const saved = parseInt(localStorage.getItem(KEY) ?? '', 10)
    return saved >= 0 && saved < VARIANTS.length ? saved : 0
  } catch {
    return 0
  }
}

export function useVariant() {
  const [current, setCurrent] = React.useState(0)
  const [nonce, setNonce] = React.useState(0)
  React.useEffect(() => {
    setCurrent(read())
    // ピッカーとホームは別々にこのフックを持つので、切り替え・描き直しは window の知らせで揃える
    const sync = () => {
      setCurrent(read())
      setNonce((n) => n + 1)
    }
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    try {
      localStorage.setItem(KEY, String(i))
    } catch {
      // 保存できなくても、その場では切り替える
    }
    const url = new URL(location.href)
    url.searchParams.set('v', String(i + 1))
    history.replaceState(history.state, '', url)
    window.dispatchEvent(new Event(EVENT))
  }, [])
  const replay = React.useCallback(() => window.dispatchEvent(new Event(EVENT)), [])
  return { current, key: `${current}-${nonce}`, select, replay }
}
