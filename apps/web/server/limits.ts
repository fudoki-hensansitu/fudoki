// チャットの乱用対策の上限。流量は deploy/cloudflare.config.ts の rate limit binding と同じ値で、limits.test.ts が照合する。
// config が import したファイルは cf dev（vite）の Worker から読めないので、apps/api と同じく値を二重に持つ。
/** 1つの IP が1分に始められる会話と送れるメッセージの数（session の開始と /api/chat を合わせて数える） */
export const CHAT_RATE_LIMIT = { limit: 10, period: 60 } as const
/** View が表の移動・追加ページで呼ぶ tool の中継。1つの IP が1分に呼べる回数 */
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
/** View が AI に伝える「いま見ているもの」の文字数 */
export const MAX_VIEW_CONTEXT = 2000
/** View の中継の body の上限（apps/api の MCP と同じ） */
export const MAX_RELAY_BODY_BYTES = 16 * 1024
/** Turnstile を通してから会話を続けられる時間（秒） */
export const SESSION_TTL_SECONDS = 2 * 60 * 60

/** View が直接呼んでよい tool。表の移動・追加ページ・経路の段の検索だけで、描画 tool と評価の検索は呼ばせない */
export const VIEW_TOOLS: ReadonlySet<string> = new Set(['search_expenditure_nodes', 'get_expenditure_node'])
/** View が読んでよい resource。風土記の View の HTML だけ */
export const VIEW_RESOURCE = /^ui:\/\/fudoki\/[A-Za-z0-9._-]+$/
