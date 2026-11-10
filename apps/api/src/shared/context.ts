// 要求ごとの依存と、Hono の app の型（集約の routes が共有する）。
import type { Db, Env } from '../db'
import type { EvaluationDeps } from '../evaluations'

export interface Ctx {
  db: Db
  /** 評価の検索の依存。AI Search・流量・日ごとの総数はここ越しに呼び、試験は偽物に差し替える。 */
  evaluation?: EvaluationDeps
}

export type AppEnv = { Bindings: Env; Variables: { ctx: Ctx; json: unknown } }
