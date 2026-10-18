// Worker の binding のうち、使う部分だけの型。実体は deploy/cloudflare.config.ts が宣言し、試験は同じ形の偽物を渡す。
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}
export interface AnalyticsDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void
}
export interface Fetcher {
  fetch(request: Request): Promise<Response>
}

export interface Env {
  /** Workers AI。型は workers-ai-provider が求める Ai をそのまま渡す */
  AI?: unknown
  /** apps/api（fudoki-api）への Service Binding。無ければ（手元の試験など）公開 URL に繋ぐ */
  API?: Fetcher
  CHAT_RATE_LIMIT?: RateLimiter
  VIEW_RATE_LIMIT?: RateLimiter
  /** 利用状況（会話の本文・IP は書かない） */
  CHAT_USAGE?: AnalyticsDataset
  /** Workers AI のモデル ID。config の var で切り替える */
  CHAT_MODEL?: string
  /** Turnstile の site key（公開値、config の var） */
  TURNSTILE_SITE_KEY?: string
  /** Turnstile の secret key（Worker の secret）。session の署名の鍵もここから作る */
  TURNSTILE_SECRET_KEY?: string
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void
}

/** apps/api の MCP の URL。Service Binding でもこの URL で呼び、結果の _meta.apiOrigin を本番と同じにする */
export const MCP_URL = 'https://api.fudoki.dev/mcp'

export function apiFetch(env: Env): typeof fetch {
  const api = env.API
  if (!api) return fetch
  return ((input: RequestInfo | URL, init?: RequestInit) => api.fetch(new Request(input, init))) as typeof fetch
}
