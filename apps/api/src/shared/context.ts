// 要求ごとの依存と、Hono の app の型（集約の routes が共有する）。
import type { Db, Env } from '../db'

export interface Ctx {
  db: Db
}

/** 資格情報を確かめた呼び出し元。問い合わせの処理（queries.ts・model.ts）には渡さない */
export interface Caller {
  userId: string
  credential: 'api_key'
}

export type AppEnv = { Bindings: Env; Variables: { ctx: Ctx; json: unknown; caller: Caller } }
