// 試作: 「うちのまち」を複数持つ（住んでいる・働いている・実家など）。ブラウザ（localStorage）にだけ置き、サーバーには送らない。
// サイドバーとホームが同じ一覧を読むので、変えたら window に知らせる
import * as React from 'react'
import { loadHomeCode, loadRecent, type RecentJurisdiction } from '../home/recent'

const KEY = 'fudoki:my-towns'
const EVENT = 'fudoki:my-towns'
export const MAX_TOWNS = 5

export type Town = RecentJurisdiction

function read(): Town[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Town[] | null
    if (Array.isArray(list)) return list.slice(0, MAX_TOWNS)
    // まだ一覧が無ければ、今のホームで選んだまちを引き継ぐ
    const home = loadHomeCode()
    const hit = home ? loadRecent().find((r) => r.code === home) : undefined
    return hit ? [hit] : []
  } catch {
    return []
  }
}

function write(list: Town[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_TOWNS)))
  } catch {
    // 保存できなくても、その場では選んだまちを出す
  }
  window.dispatchEvent(new Event(EVENT))
}

/** うちのまちの一覧と、足す・外す・先頭にする操作。描いたあとに読む（サーバーの HTML では空） */
export function useMyTowns() {
  const [towns, setTowns] = React.useState<Town[]>([])
  const [recent, setRecent] = React.useState<Town[]>([])
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    const sync = () => {
      setTowns(read())
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
  const add = (t: Town) => write([t, ...read().filter((x) => x.code !== t.code)])
  const remove = (code: string) => write(read().filter((x) => x.code !== code))
  return { ready, towns, recent: recent.filter((r) => !towns.some((t) => t.code === r.code)), add, remove }
}

export const emblemSrc = (code: string) => `/jurisdictions/${code}/emblem.svg`
