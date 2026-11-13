// web（風土記のサイト）の Worker だけが Service Binding（entrypoint: Web）で呼ぶ内部の RPC。HTTP の route を持たないので、インターネットからは呼べない（ADR 0044）。
// 公開の REST・MCP と同じ問い合わせを呼び、入口だけを分ける。bun の試験は cloudflare:workers を読めないので、処理は web-ops.ts と app.ts に置く
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env } from './db'
import { webMcp } from './app'
import { callWebOp, type WebResult } from './web-ops'

export class Web extends WorkerEntrypoint<Env> {
  /** 名前の操作（web-ops.ts の WEB_OPS）を、公開の口と同じ入力で呼ぶ */
  async call(name: string, input: unknown): Promise<WebResult<unknown>> {
    return callWebOp(this.env, name, input)
  }

  /** アシスタントの MCP の1要求 */
  async mcp(request: Request): Promise<Response> {
    return webMcp(this.env, request)
  }
}
