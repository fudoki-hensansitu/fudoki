// 試作: 「うちのまち」（1つ）と最近見たまち。ブラウザ（localStorage）にだけ置き、サーバーには送らない。
// サイドバーとホームが同じものを読むので、変えたら window に知らせる。うちのまちのコードは今のホームと同じ鍵（saveHomeCode）にも書く
import * as React from 'react'
import { loadHomeCode, loadRecent, saveHomeCode, type RecentJurisdiction } from '../home/recent'

const KEY = 'fudoki:home-town'
const EVENT = 'fudoki:home-town'

export type Town = RecentJurisdiction

function read(): Town | null {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Town | null
    if (t?.code) return t
    // まだ無ければ、今のホームで選んだまちを最近見たまちから引き継ぐ
    const home = loadHomeCode()
    return (home && loadRecent().find((r) => r.code === home)) || null
  } catch {
    return null
  }
}

export function setMyTown(t: Town | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    // 保存できなくても、その場では選んだまちを出す
  }
  saveHomeCode(t?.code ?? null)
  window.dispatchEvent(new Event(EVENT))
}

/** うちのまちと最近見たまち（うちのまちを除く）。描いたあとに読む（サーバーの HTML では空） */
export function useMyTown() {
  const [town, setTown] = React.useState<Town | null>(null)
  const [recent, setRecent] = React.useState<Town[]>([])
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    const sync = () => {
      setTown(read())
      setRecent(loadRecent())
      setReady(true)
    }
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return { ready, town, recent: recent.filter((r) => r.code !== town?.code), set: setMyTown }
}

export const emblemSrc = (code: string) => `/jurisdictions/${code}/emblem.svg`
