// チャットの乱用対策の上限。流量は void.config.ts の rate limit binding と同じ値で、security.test.ts が照合する。
// 値は void.config.ts と二重に持つ（apps/api と同じ。config は build のたびに評価されるので、Worker のコードを import させない）。
/** 1つの IP が1分に始められる会話と送れるメッセージの数（session の開始と /api/chat を合わせて数える） */
export const CHAT_RATE_LIMIT = { limit: 10, period: 60 } as const
/** 閲覧の読み込み（自治体の検索と札・事業の一覧の続きと詳細）を合わせて、1つの IP が1分に呼べる回数 */
export const VIEW_RATE_LIMIT = { limit: 60, period: 60 } as const

/** 1回の応答で AI が tool を呼んで考え直す段数の上限 */
export const MAX_STEPS = 6
/** 1回の応答で AI が書く（考える分を含む）token の上限 */
export const MAX_OUTPUT_TOKENS = 4096
/** /api/chat の body の上限。履歴は tool の結果の text を含むので大きめにとる */
export const MAX_CHAT_BODY_BYTES = 256 * 1024
/** 1つの会話で送れるメッセージの数（利用者と AI の両方を数える） */
export const MAX_MESSAGES = 40
/** 利用者の1メッセージの文字数 */
export const MAX_USER_TEXT = 2000
/** 利用者の発言に付ける、頁で見ているもの・選んだ文（context）の文字数 */
export const MAX_VIEW_CONTEXT = 2000
/** Turnstile を通してから会話を続けられる時間（秒） */
export const SESSION_TTL_SECONDS = 2 * 60 * 60
