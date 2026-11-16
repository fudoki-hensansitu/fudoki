// D1 のうち使う部分だけの型。実際の D1Database はこれを満たし、テストは bun:sqlite で満たす。
export interface Statement {
  bind(...values: unknown[]): Statement
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  first<T = Record<string, unknown>>(): Promise<T | null>
}

export interface Db {
  prepare(sql: string): Statement
  batch<T = Record<string, unknown>>(statements: Statement[]): Promise<{ results: T[] }[]>
}

/** Workers の Rate Limiting binding のうち使う部分 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** Workers Analytics Engine の dataset のうち使う部分 */
export interface CallLog {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void
}

export interface Env {
  DB: Db
  ORIGIN_PDF?: import('./origin-pdf').RelayNamespace
  /** WorkOS の API キーの検証に使う secret */
  WORKOS_API_KEY: string
  /** 全利用者が入る WorkOS の organization（developers）の ID。public repo なので secret で受ける */
  WORKOS_DEVELOPERS_ORG_ID: string
  /** 検証に失敗した要求の IP ごとの上限 */
  API_KEY_FAILURES: RateLimiter
  /** 利用者ごとの呼び出しの上限 */
  API_CALLER_LIMIT: RateLimiter
  /** 公開の REST の呼び出しの記録 */
  API_CALLS: CallLog
}
