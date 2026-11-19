// 「気になる」の問いを持つ自治体と、その読み込み。問いは自治体ごとの module に置き、そのタブの頁の loader だけが読む（頁の JS に全自治体の文を載せない）
import { OTHER_FRAME } from '../domains'
import type { Question, QuestionFeed } from './types'

const FEEDS: Record<string, () => Promise<QuestionFeed>> = {
  '131091': () => import('./131091').then((m) => m.feed),
}

/** 自治体の問い。まだ作っていないまちは空のフィード（入口は質問のボタンだけになる） */
export function loadQuestions(code: string): Promise<QuestionFeed> {
  return FEEDS[code]?.() ?? Promise.resolve({ order: [], questions: [] })
}

/** 分野のフィード。すべてなら決めた並び、分野なら先頭の問い（1人いくら）とその分野の問い */
export function feedOf(feed: QuestionFeed, field: string | null): Question[] {
  const byId = new Map(feed.questions.map((q) => [q.id, q]))
  if (!field) return feed.order.flatMap((id) => byId.get(id) ?? [])
  // 分野をまたぐ問い（field 無し）は「その他」
  const of = (q: Question) => (q.field ?? OTHER_FRAME.id) === field
  return [...feed.questions.filter((q) => of(q) && q.lead), ...feed.questions.filter((q) => of(q) && !q.lead)]
}
