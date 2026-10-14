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

export interface Env {
  DB: Db
  ORIGIN_PDF?: import('./origin-pdf').RelayNamespace
  /** 評価の検索。手順5で operations に登録するまで、どの経路からも使わない。 */
  EVALUATION_SEARCH?: import('./evaluations').EvaluationSearchClient
  EVALUATION_RATE_LIMIT?: import('./evaluations').RateLimiter
  EVALUATION_QUOTA?: import('./evaluation-quota').QuotaNamespace
}
