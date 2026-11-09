// ブラウザ（localStorage）に置く、最近見た自治体とホームの「うちのまち」。サーバーには送らない。読めない環境では何もしない
const KEY = 'fudoki:recent-jurisdictions'
const MAX = 6

export interface RecentJurisdiction {
  code: string
  name: string
  path: string
}

export function loadRecent(): RecentJurisdiction[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentJurisdiction[]
    return Array.isArray(list) ? list.slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberJurisdiction(j: RecentJurisdiction) {
  try {
    localStorage.setItem(KEY, JSON.stringify([j, ...loadRecent().filter((r) => r.code !== j.code)].slice(0, MAX)))
  } catch {
    // 保存できなくても頁はそのまま見られる
  }
}

const HOME_KEY = 'fudoki:home-jurisdiction'

/** ホームの「うちのまち」に選んだ自治体の自治体コード */
export function loadHomeCode(): string | null {
  try {
    return localStorage.getItem(HOME_KEY)
  } catch {
    return null
  }
}

export function saveHomeCode(code: string | null) {
  try {
    if (code) localStorage.setItem(HOME_KEY, code)
    else localStorage.removeItem(HOME_KEY)
  } catch {
    // 保存できなくても、その場では選んだ自治体を出す
  }
}
