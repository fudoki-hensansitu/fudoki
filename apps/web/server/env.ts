// Worker の binding のうち、使う部分だけの型。実体は void.config.ts が宣言し、試験は同じ形の偽物を渡す。
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}
export interface AnalyticsDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void
}
/** D1 の使う部分だけ（会話を保存する・人口を読む） */
export interface ChatLogStatement {
  bind(...values: unknown[]): ChatLogStatement
  all?<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}
export interface WebDatabase {
  prepare(sql: string): ChatLogStatement
  batch(statements: ChatLogStatement[]): Promise<unknown>
}
export interface Fetcher {
  fetch(request: Request): Promise<Response>
}

export interface Env {
  /** Workers AI。型は workers-ai-provider が求める Ai をそのまま渡す */
  AI?: unknown
  /** apps/api の内部の RPC（Service Binding・entrypoint Web）。web が api を読むのはこれだけ（server/fudoki-api.ts）。無ければ（手元の開発・試験）公開の api に繋ぐ */
  WEB?: import('./fudoki-api').WebRpc
  /** apps/api の内部の RPC（entrypoint SourcePages）。出典の頁の文字を読む（server/source-pages.ts）。無ければ tool を出さない */
  SOURCES?: import('./source-pages').SourcePagesRpc
  CHAT_RATE_LIMIT?: RateLimiter
  VIEW_RATE_LIMIT?: RateLimiter
  /** 利用状況（会話の本文・IP は書かない） */
  CHAT_USAGE?: AnalyticsDataset
  /** web 自身のデータ。会話の保存（server/chat-log.ts。IP は書かない）と住民基本台帳人口（server/population.ts）。無ければ書かず、人口も出さない */
  DB?: WebDatabase
  /** Workers AI のモデル ID。config の var で切り替える */
  CHAT_MODEL?: string
  /** 推論の深さ（low・medium・high・none）。未設定・不明な値ならモデルの既定 */
  CHAT_REASONING_EFFORT?: string
  /** Turnstile の site key（公開値、config の var） */
  TURNSTILE_SITE_KEY?: string
  /** Turnstile の secret key（Worker の secret）。session の署名の鍵もここから作る */
  TURNSTILE_SECRET_KEY?: string
}
