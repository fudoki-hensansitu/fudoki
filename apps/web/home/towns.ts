// 住んでいるまち（1つ）と最近見たまち。ブラウザ（localStorage）にだけ置き、サーバーには送らない。
// サイドバーとホームが同じものを読むので、変えたら window に知らせる。住んでいるまちのコードは前のホームと同じ鍵（saveHomeCode、fudoki:home-jurisdiction）を正にし、前に選んだ人はそのまま引き継ぐ
import * as React from 'react'
import { loadHomeCode, loadRecent, saveHomeCode, type RecentJurisdiction } from './recent'
import { townMatches, type MapEntry } from '../jurisdiction/index-table'

const KEY = 'fudoki:home-town'
const EVENT = 'fudoki:home-town'

export type Town = RecentJurisdiction

export { townMatches }

/** 探す語に当たる自治体（上位 10 件）。サーバー（/api/jurisdictions?q=）が当てて返す。読めなければ null */
export const searchTowns = (q: string, signal?: AbortSignal): Promise<MapEntry[] | null> =>
  fetch(`/api/jurisdictions?${new URLSearchParams({ q })}`, { signal })
    .then((r) => (r.ok ? (r.json() as Promise<MapEntry[]>) : null))
    .catch(() => null)

/** 自治体コードで1つ引く（/api/jurisdictions?code=）。収録が無ければ undefined、読めなければ null */
const townOf = (code: string): Promise<MapEntry | undefined | null> =>
  fetch(`/api/jurisdictions?${new URLSearchParams({ code })}`)
    .then((r) => (r.ok ? (r.json() as Promise<MapEntry[]>).then((x) => x[0]) : null))
    .catch(() => null)

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
      // 今のホームで選んだだけのまちは名前が手元に無いので、コードで引く
      if (!t && home) {
        const look = (wait: number) =>
          void townOf(home).then((e) => {
            // 引いている間に外れた・別のまちに変わったときは捨てる
            if (!alive || loadHomeCode() !== home) return
            // 引けなかったときは、選んだまちが無いとは扱わず引き直す（初めての人の画面を出さない）
            if (e === null) return void setTimeout(() => look(Math.min(wait * 2, 30_000)), wait)
            if (e) setMyTown({ code: e.code, name: e.name, path: e.path })
            else setReady(true)
          })
        look(2_000)
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
