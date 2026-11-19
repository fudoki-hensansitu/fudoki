// 「気になる」の問いを持つ自治体と、その読み込み。問いは自治体ごとの module に置き、そのタブの頁の loader だけが読む（頁の JS に全自治体の文を載せない）
import { OTHER_FRAME } from '../domains'
import { GENERIC } from './generic'
import type { Question, QuestionFeed } from './types'

const FEEDS: Record<string, () => Promise<QuestionFeed>> = {
  '131091': () => import('./131091').then((m) => m.feed),
}

/** 自治体の問い。個別に書いた問いが無ければ、どのまちでも作れる問い（generic/）。どちらも無いまちは空のフィード（入口は質問のボタンだけになる） */
export function loadQuestions(code: string): Promise<QuestionFeed> {
  return (FEEDS[code] ?? GENERIC[code])?.() ?? Promise.resolve({ order: [], questions: [] })
}

/** 分野のフィード。すべてなら決めた並び、分野なら先頭の問い（1人いくら）とその分野の問い。
 * すべてのときは、興味のある分野（interests、選んだ順）の問いを先に並べる。同じ分野の中は決めた並びのまま */
export function feedOf(feed: QuestionFeed, field: string | null, interests: string[] = []): Question[] {
  const byId = new Map(feed.questions.map((q) => [q.id, q]))
  if (!field) {
    const all = feed.order.flatMap((id) => byId.get(id) ?? [])
    const rank = (q: Question) => {
      const i = interests.indexOf(q.field ?? OTHER_FRAME.id)
      return i < 0 ? interests.length : i
    }
    return interests.length ? [...all].sort((a, b) => rank(a) - rank(b)) : all
  }
  // 分野をまたぐ問い（field 無し）は「その他」
  const of = (q: Question) => (q.field ?? OTHER_FRAME.id) === field
  return [...feed.questions.filter((q) => of(q) && q.lead), ...feed.questions.filter((q) => of(q) && !q.lead)]
}
