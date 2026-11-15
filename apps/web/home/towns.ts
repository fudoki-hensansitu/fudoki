// 住んでいるまち（1つ）と最近見たまち。ブラウザ（localStorage）にだけ置き、サーバーには送らない。
// サイドバーとホームが同じものを読むので、変えたら window に知らせる。住んでいるまちのコードは前のホームと同じ鍵（saveHomeCode、fudoki:home-jurisdiction）を正にし、前に選んだ人はそのまま引き継ぐ
import * as React from 'react'
import { loadHomeCode, loadRecent, saveHomeCode, type RecentJurisdiction } from './recent'
import type { MapEntry } from '../jurisdiction/index-table'

const KEY = 'fudoki:home-town'
const EVENT = 'fudoki:home-town'

export type Town = RecentJurisdiction

/** 探す語に当たる自治体の1頁。next は続きの印（api の頁送り、無ければ null） */
export type TownPage = { entries: MapEntry[]; next: string | null }

/** 探す語に当たる自治体を1頁ぶん。cursor が無ければ最初の頁。サーバー（/api/jurisdictions?name=&cursor=）が api の頁送りのまま返す。読めなければ null */
const searchTowns = (q: string, cursor: string | null, signal?: AbortSignal): Promise<TownPage | null> =>
  fetch(`/api/jurisdictions?${new URLSearchParams({ name: q, ...(cursor ? { cursor } : {}) })}`, { signal })
    .then((r) => (r.ok ? (r.json() as Promise<TownPage>) : null))
    .then((p) => (p && Array.isArray(p.entries) ? p : null))
    .catch(() => null)

/** 打ち終えるのを待つ間 */
const TYPING_MS = 150

/** 名前で自治体を探す候補（まちを探す・まち比べ）。開いている間だけ、打った語の1頁目を読み、more で続きを足す。
 * 全部を手元に取らず、一覧の末尾の印（MoreDots）が見えたら more を呼ぶ。entries は undefined が読んでいる、null が読めなかった。word は entries を読んだ語 */
export function useTownSearch(open: boolean, q: string) {
  // 読んだ頁は、どの語で読んだかと一緒に持つ（続きは同じ語で読む）
  const [page, setPage] = React.useState<(TownPage & { q: string }) | null | undefined>(undefined)
  const [attempt, retry] = React.useReducer((n: number) => n + 1, 0)
  // 続きを読んでいる間は重ねて読まない。語が変わったら読みかけの続きは捨てる
  const loading = React.useRef<AbortController | null>(null)
  const [tries, bump] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    loading.current?.abort()
    loading.current = null
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(() => void searchTowns(q, null, controller.signal).then((p) => !controller.signal.aborted && setPage(p && { ...p, q })), q ? TYPING_MS : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
      loading.current?.abort()
      loading.current = null
    }
  }, [open, q, attempt])
  const next = page?.next ?? null
  const more = () => {
    if (loading.current || !page || next === null) return
    const word = page.q
    const controller = new AbortController()
    loading.current = controller
    void searchTowns(word, next, controller.signal).then((p) => {
      if (controller.signal.aborted) return
      if (p) setPage((cur) => (cur && cur.q === word && cur.next === next ? { q: word, entries: [...cur.entries, ...p.entries], next: p.next } : cur))
      // 読めなければ少し待って印を置き直す（見えたままなら、もう一度読みに行く）
      setTimeout(() => {
        if (loading.current === controller) loading.current = null
        bump()
      }, p ? 0 : 3000)
    })
  }
  // 頁が空でも続きがあれば、当たらないとは言わずに読んでいる扱いにする（末尾の印が続きを読む）
  const entries = page === undefined || (page && page.entries.length === 0 && next !== null) ? undefined : (page?.entries ?? null)
  return { entries, word: page?.q, hasMore: next !== null, more, moreKey: `${page?.entries.length ?? 0}:${tries}`, retry }
}

/** 自治体コードで1つ引く（/api/jurisdictions?code=）。収録が無ければ undefined、読めなければ null */
export const townOf = (code: string): Promise<MapEntry | undefined | null> =>
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

/** アシスタントに渡す文脈の1行。住んでいるまちを選んでいれば、そのまちを伝える（選んでいなければ空） */
export function myTownContext() {
  const t = read()
  return t ? `利用者が住んでいるまち（本人が選んだもの）: ${t.name}（自治体コード: ${t.code}）` : ''
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
