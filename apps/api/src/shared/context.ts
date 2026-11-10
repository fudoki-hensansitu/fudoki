// 要求ごとの依存と、Hono の app の型（集約の routes が共有する）。
import type { Db, Env } from '../db'

export interface Ctx {
  db: Db
}

export type AppEnv = { Bindings: Env; Variables: { ctx: Ctx; json: unknown } }
