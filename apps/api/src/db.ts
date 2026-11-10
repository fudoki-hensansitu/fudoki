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
  /** 出典の頁の文字（非公開 R2 fudoki-inputs）。読み取りだけの型にしてある。内部の RPC（SourcePages）だけが使う */
  SOURCE_TEXT?: import('./source-pages').SourceTextBucket
}
