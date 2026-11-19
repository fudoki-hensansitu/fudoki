// web（風土記のサイト）の Worker だけが Service Binding（entrypoint: Web）で呼ぶ内部の RPC。HTTP の route を持たないので、インターネットからは呼べない（ADR 0044）。
// 公開の REST・MCP と同じ問い合わせを呼び、入口だけを分ける。bun の試験は cloudflare:workers を読めないので、処理は web-ops.ts に置く
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env } from './db'
import { assistantTools, callAssistantTool, callWebOp, type AssistantTool, type AssistantToolResult, type WebResult } from './web-ops'

export class Web extends WorkerEntrypoint<Env> {
  /** 名前の操作（web-ops.ts の WEB_OPS）を、公開の口と同じ入力で呼ぶ */
  async call(name: string, input: unknown): Promise<WebResult<unknown>> {
    return callWebOp(this.env, name, input)
  }

  /** アシスタント（web の AI）に渡す tool の定義 */
  async tools(): Promise<AssistantTool[]> {
    return assistantTools()
  }

  /** アシスタントの tool を1回呼ぶ */
  async runTool(name: string, input: unknown): Promise<WebResult<AssistantToolResult>> {
    return callAssistantTool(this.env, name, input)
  }
}
