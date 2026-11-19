// web が apps/api を呼ぶ口。本番は api の内部の RPC（Service Binding・entrypoint Web）だけを使い、公開の REST・MCP は使わない（ADR 0044）。
// binding の無い手元の開発と試験だけ、同じ操作を公開の REST に、アシスタントの tool を公開の MCP に読み替えて呼ぶ（restRpc）
import type { AssistantTool, WebOpInput, WebOpName, WebOpOutput, WebRpc } from '@fudoki/api/rpc'
import { readSuggestions } from '../../../packages/fiscal/suggestions'
import type { Env } from './env'

export type { AssistantTool, WebOpInput, WebOpName, WebOpOutput, WebRpc }

export const API_ORIGIN = 'https://api.fudoki.dev'
/** 公開の MCP の URL（エージェント向けの案内と、手元の開発の読み替えに使う） */
export const MCP_URL = `${API_ORIGIN}/mcp`

/** api が返した失敗。status は公開の REST と同じ */
export class FudokiApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** 操作を名前で呼び、失敗は FudokiApiError で投げる */
export type ApiCall = <N extends WebOpName>(name: N, input: WebOpInput<N>) => Promise<WebOpOutput<N>>

let warned = false
/** binding が無いとき（手元の開発・試験）だけ公開の REST に読み替える。本番で binding を落としたと気づけるよう、一度だけ警告を出す */
export const fudokiApi = (env: Pick<Env, 'WEB' | 'FUDOKI_API_KEY'>): WebRpc => {
  if (env.WEB) return env.WEB
  if (!warned) {
    warned = true
    console.warn('WEB binding が無いので、公開の api（api.fudoki.dev）に読み替えます。手元の開発・試験のほかでは起きてはいけません')
  }
  // 公開の REST は API キーが要る（auth.fudoki.dev で発行し、apps/web/.env の FUDOKI_API_KEY に置く）
  return restRpc((r) => {
    if (env.FUDOKI_API_KEY) r.headers.set('authorization', `Bearer ${env.FUDOKI_API_KEY}`)
    return fetch(r)
  })
}

export function apiCall(env: Pick<Env, 'WEB' | 'FUDOKI_API_KEY'>): ApiCall {
  const rpc = fudokiApi(env)
  return async (name, input) => {
    const r = await rpc.call(name, input)
    if (!r.ok) throw new FudokiApiError(r.status, r.code, r.message)
    return r.value
  }
}

/** 操作を公開の REST の要求に読み替える。web が使う操作だけを持つ */
function restRequest(name: WebOpName, input: Record<string, unknown>): Request | null {
  const post = (path: string) => new Request(`${API_ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const id = (key: string) => encodeURIComponent(String(input[key]))
  switch (name) {
    case 'list_jurisdictions': {
      const url = new URL('/v1/jurisdictions', API_ORIGIN)
      for (const [k, v] of Object.entries(input)) if (v !== undefined) url.searchParams.set(k, String(v))
      return new Request(url)
    }
    case 'get_jurisdiction':
      return new Request(`${API_ORIGIN}/v1/jurisdictions/${id('jurisdiction_code')}`)
    case 'get_project':
      return new Request(`${API_ORIGIN}/v1/projects/${id('project_id')}`)
    case 'search_expenditure_subjects':
      return post('/v1/expenditures/subjects:search')
    case 'search_expenditure_details':
      return post('/v1/expenditures/details:search')
    case 'get_expenditure_line': {
      const url = new URL(`/v1/expenditures/lines/${id('line_id')}`, API_ORIGIN)
      if (input.page_size !== undefined) url.searchParams.set('page_size', String(input.page_size))
      return new Request(url)
    }
    case 'search_evaluation_sheets':
      return post('/v1/evaluations/sheets:search')
    case 'search_projects':
      return post('/v1/projects:search')
    case 'get_revenue': {
      const url = new URL('/v1/revenues', API_ORIGIN)
      for (const [k, v] of Object.entries(input)) if (v !== undefined) url.searchParams.set(k, String(v))
      return new Request(url)
    }
    default:
      return null
  }
}

/** 手元の開発と試験の代わりの口。fetcher は公開の api（試験は同じ形の偽物）に繋ぐ */
export function restRpc(fetcher: (request: Request) => Promise<Response>): WebRpc {
  return {
    async call(name, input) {
      const req = restRequest(name, input as Record<string, unknown>)
      if (!req) return { ok: false, status: 404, code: 'NOT_FOUND', message: `REST に読み替えられない操作です: ${name}` }
      const res = await fetcher(req)
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
      if (!res.ok) return { ok: false, status: res.status, code: body?.error?.code ?? 'UNAVAILABLE', message: body?.error?.message ?? `${name} ${res.status}` }
      return { ok: true, value: body as never }
    },
    // アシスタントの tool は公開の MCP の tools/list・tools/call に読み替える（描画 tool は除く）。web だけの操作は手元では出ない
    async tools() {
      const result = (await mcpCall(fetcher, 'tools/list', {})) as { tools: AssistantTool[] }
      return result.tools.filter((t) => t.name !== 'render_expenditure_view').map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
    },
    async runTool(name, input) {
      const r = (await mcpCall(fetcher, 'tools/call', { name, arguments: input })) as { isError?: boolean; content?: { text?: string }[]; structuredContent?: unknown; _meta?: unknown }
      if (r.isError) {
        // 風土記の失敗は {error: {code, message}} の JSON、MCP の SDK の入力検査の失敗はただの文
        const raw = r.content?.[0]?.text ?? name
        let body: { error?: { code?: string; message?: string } } = {}
        try {
          body = JSON.parse(raw)
        } catch {}
        return { ok: false, status: 400, code: body.error?.code ?? 'INVALID_ARGUMENT', message: body.error?.message ?? raw }
      }
      return { ok: true, value: { value: r.structuredContent, suggestions: readSuggestions(r._meta) } }
    },
  }
}

/** JSON-RPC を1つ公開の MCP に送り、JSON か SSE の data 行から result を取り出す */
async function mcpCall(fetcher: (request: Request) => Promise<Response>, method: string, params: unknown): Promise<unknown> {
  const res = await fetcher(
    new Request(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  )
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  const message = JSON.parse(data ? data[1]! : text) as { result?: unknown; error?: { message?: string } }
  if (!res.ok || message.error || message.result === undefined) throw new Error(message.error?.message ?? `MCP ${res.status}`)
  return message.result
}
