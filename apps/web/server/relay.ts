// MCP Apps の View が host に頼む tools/call・resources/read を apps/api の MCP へ中継する。
// View は sandbox の iframe の中で動き、許可した tool と風土記の View の resource だけを呼べる。
import { apiFetch, MCP_URL, type Ctx, type Env } from './env'
import { clientIp, HttpError, json, rateLimit, readJson } from './http'
import { MAX_RELAY_BODY_BYTES, VIEW_RATE_LIMIT, VIEW_RESOURCE, VIEW_TOOLS } from './limits'
import { verifySession } from './session'
import { writeUsage } from './usage'

type RelayRequest =
  | { method: 'tools/call'; params: { name: string; arguments: Record<string, unknown> } }
  | { method: 'resources/read'; params: { uri: string } }

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 許可していない method・tool・resource は 403 */
export function parseRelay(body: unknown): RelayRequest {
  if (!isRecord(body) || !isRecord(body.params)) throw new HttpError(400, 'INVALID_ARGUMENT', 'method と params を送ってください')
  const { method, params } = body
  if (method === 'tools/call') {
    if (typeof params.name !== 'string' || !VIEW_TOOLS.has(params.name)) throw new HttpError(403, 'PERMISSION_DENIED', 'この tool は呼べません')
    const args = params.arguments ?? {}
    if (!isRecord(args)) throw new HttpError(400, 'INVALID_ARGUMENT', 'arguments は object にしてください')
    return { method, params: { name: params.name, arguments: args } }
  }
  if (method === 'resources/read') {
    if (typeof params.uri !== 'string' || !VIEW_RESOURCE.test(params.uri)) throw new HttpError(403, 'PERMISSION_DENIED', 'この resource は読めません')
    return { method, params: { uri: params.uri } }
  }
  throw new HttpError(403, 'PERMISSION_DENIED', 'この method は使えません')
}

/** JSON-RPC を1つ送り、JSON か SSE の data 行から result を取り出す */
export async function callMcp(env: Env, ip: string, method: string, params: unknown) {
  const res = await apiFetch(env)(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      // apps/api の評価の検索は IP ごとに数えるので、利用者の IP を渡す（Service Binding では自動で付かない）
      ...(ip ? { 'CF-Connecting-IP': ip } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await res.text()
  const data = /^data: (.*)$/m.exec(text)
  const message = JSON.parse(data ? data[1]! : text) as { result?: unknown; error?: { message?: string } }
  if (!res.ok || message.error || message.result === undefined)
    throw new HttpError(502, 'UNAVAILABLE', message.error?.message ?? `風土記の API が応答しませんでした（${res.status}）`)
  return message.result
}

export async function handleRelay(request: Request, env: Env, _ctx: Ctx): Promise<Response> {
  const started = Date.now()
  await verifySession(env.TURNSTILE_SECRET_KEY, request.headers.get('Authorization'))
  const ip = clientIp(request)
  await rateLimit(env.VIEW_RATE_LIMIT, ip, VIEW_RATE_LIMIT.period)
  const relay = parseRelay(await readJson(request, MAX_RELAY_BODY_BYTES))
  const tool = relay.method === 'tools/call' ? relay.params.name : ''
  let failed = false
  try {
    return json(await callMcp(env, ip, relay.method, relay.params))
  } catch (e) {
    failed = true
    throw e
  } finally {
    if (tool) writeUsage(env.CHAT_USAGE, { kind: 'relay', model: '', inputTokens: 0, outputTokens: 0, tools: { [tool]: 1 }, steps: 0, durationMs: Date.now() - started, error: failed ? 'mcp' : '' })
  }
}
