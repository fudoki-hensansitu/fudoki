// 試作: 「うちのまち」（1つ）と最近見たまち。ブラウザ（localStorage）にだけ置き、サーバーには送らない。
// サイドバーとホームが同じものを読むので、変えたら window に知らせる。うちのまちのコードは今のホームと同じ鍵（saveHomeCode）にも書く
import * as React from 'react'
import { loadHomeCode, loadRecent, saveHomeCode, type RecentJurisdiction } from '../home/recent'
import type { MapEntry } from '../jurisdiction/index-table'

const KEY = 'fudoki:home-town'
const EVENT = 'fudoki:home-town'

export type Town = RecentJurisdiction

/** 収録している自治体の一覧。必要になったときに一度だけ読み、失敗したら次に読み直す */
let townsPromise: Promise<MapEntry[]> | null = null
export const loadTowns = () =>
  (townsPromise ??= fetch('/api/prototype/towns')
    .then((r) => (r.ok ? (r.json() as Promise<MapEntry[]>) : Promise.reject(r)))
    .catch(() => {
      // 失敗は覚えず、次に引くときにもう一度取りに行く
      townsPromise = null
      return [] as MapEntry[]
    }))

function read(): Town | null {
  try {
    // うちのまちの正は今のホームと同じ鍵。今のホームで変えたら、最近見たまちから名前を引く
    const home = loadHomeCode()
    if (!home) return null
    const t = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Town | null
    return t?.code === home ? t : loadRecent().find((r) => r.code === home) || null
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
    let alive = true
    const sync = () => {
      const t = read()
      const home = loadHomeCode()
      // 今のホームで選んだだけのまちは名前が手元に無いので、一覧から引く
      if (!t && home) {
        void loadTowns().then((list) => {
          // 引いている間に外れた・別のまちに変わったときは捨てる
          if (!alive || loadHomeCode() !== home) return
          const e = list.find((x) => x.code === home)
          if (e) setMyTown({ code: e.code, name: e.name, path: e.path })
          else setReady(true)
        })
      } else setReady(true)
      setTown(t)
      setRecent(loadRecent())
    }
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      alive = false
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return { ready, town, recent: recent.filter((r) => r.code !== town?.code), set: setMyTown }
}

export const emblemSrc = (code: string) => `/jurisdictions/${code}/emblem.svg`
