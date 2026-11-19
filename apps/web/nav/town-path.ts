// いま開いている頁が、住んでいるまちの頁（年度・予算などの頁も）か。サイドバーと下の帯の「私のまち」の選択中に使う
import { FINANCE_SLUG, TAB_SLUGS } from '../jurisdiction/types'

const TOWN_SEGMENTS = new Set<string>([...Object.values(TAB_SLUGS), FINANCE_SLUG])

/** 都道府県を選んだ人が配下の市区町村の頁にいるときは当てない。次の段が年度・頁の語のときだけ、そのまちの頁とみなす */
export function isTownPath(path: string, townPath: string) {
  if (path === townPath) return true
  if (!path.startsWith(`${townPath}/`)) return false
  const next = path.slice(townPath.length + 1).split('/')[0] ?? ''
  return /^\d{4}$/.test(next) || TOWN_SEGMENTS.has(next)
}
