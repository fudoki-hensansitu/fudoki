// web が apps/api を呼ぶ口。本番は api の内部の RPC（Service Binding・entrypoint Web）だけを使い、公開の REST・MCP は使わない（ADR 0044）。
// binding の無い手元の開発と試験だけ、同じ操作を公開の REST・MCP に読み替えて呼ぶ（restRpc）
import type { WebOpInput, WebOpName, WebOpOutput, WebRpc } from '@fudoki/api/rpc'
import type { Env } from './env'

export type { WebOpInput, WebOpName, WebOpOutput, WebRpc }

export const API_ORIGIN = 'https://api.fudoki.dev'
/** アシスタントが繋ぐ MCP の URL。内部の RPC でもこの URL の Request を渡し、結果の _meta.apiOrigin を公開の MCP と同じにする */
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
export const fudokiApi = (env: Pick<Env, 'WEB'>): WebRpc => {
  if (env.WEB) return env.WEB
  if (!warned) {
    warned = true
    console.warn('WEB binding が無いので、公開の api（api.fudoki.dev）に読み替えます。手元の開発・試験のほかでは起きてはいけません')
  }
  return restRpc((r) => fetch(r))
}

export function apiCall(env: Pick<Env, 'WEB'>): ApiCall {
  const rpc = fudokiApi(env)
  return async (name, input) => {
    const r = await rpc.call(name, input)
    if (!r.ok) throw new FudokiApiError(r.status, r.code, r.message)
    return r.value
  }
}

/** @ai-sdk/mcp などに渡す fetch。MCP_URL への要求を内部の RPC の mcp に渡す */
export function mcpFetch(env: Pick<Env, 'WEB'>): typeof fetch {
  const rpc = fudokiApi(env)
  // @ai-sdk/mcp は redirect: 'error' で呼ぶが、Workers は 'error' を受け付けず Request の生成で例外になる。'manual' なら 3xx は結果として返るので同じ安全さで足りる
  return ((input: RequestInfo | URL, init?: RequestInit) => rpc.mcp(new Request(input, init?.redirect === 'error' ? { ...init, redirect: 'manual' } : init))) as typeof fetch
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
    case 'search_budget_measures':
      return post('/v1/budget-proposals/measures:search')
    case 'search_evaluation_sheets':
      return post('/v1/evaluations/sheets:search')
    case 'search_projects':
      return post('/v1/projects:search')
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
    mcp: (request) => fetcher(request),
  }
}
