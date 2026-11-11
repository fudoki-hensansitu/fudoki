// 試作: 「うちのまち」（1つ）と最近見たまち。ブラウザ（localStorage）にだけ置き、サーバーには送らない。
// サイドバーとホームが同じものを読むので、変えたら window に知らせる。本番のホームのうちのまち（fudoki:home-jurisdiction）とは分け、試作は必ずはじめての状態から見られるようにする
import * as React from 'react'
import { loadRecent, type RecentJurisdiction } from '../home/recent'
import type { MapEntry } from '../jurisdiction/index-table'

const KEY = 'fudoki:proto-town'
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
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Town | null
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
  window.dispatchEvent(new Event(EVENT))
}

/** 試作の保存（まち・チェックリスト・ツアーの進み）を消し、はじめて開いた状態に戻す */
export function resetProto() {
  try {
    for (const k of [KEY, 'fudoki:proto-checklist', 'fudoki:proto-tour']) localStorage.removeItem(k)
  } catch {
    // 消せなければそのまま
  }
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
