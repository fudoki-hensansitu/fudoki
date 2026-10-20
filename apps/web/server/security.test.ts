// 公開する /api/* の守り（上限・Turnstile・会話の token・許可リスト）の試験。画面の振る舞いはここで見ない
import { describe, expect, test } from 'bun:test'
import web from '../worker'
import type { Env, RateLimiter } from './env'
import { CHAT_RATE_LIMIT, MAX_MESSAGES, MAX_USER_TEXT, VIEW_RATE_LIMIT } from './limits'
import { parseChat } from './chat'
import { parseRelay } from './relay'
import { issueSession, SITEVERIFY_URL, TURNSTILE_ACTION, verifySession, verifyTurnstile } from './session'

const SECRET = 'test-secret'
const allow: RateLimiter = { limit: async () => ({ success: true }) }
const deny: RateLimiter = { limit: async () => ({ success: false }) }
const env = (patch: Partial<Env> = {}): Env => ({ TURNSTILE_SECRET_KEY: SECRET, CHAT_RATE_LIMIT: allow, VIEW_RATE_LIMIT: allow, ...patch })
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://fudoki.dev${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const call = async (req: Request, e: Env) => web.fetch(req, e)

test('流量の上限は config の rate limit binding と同じ値', async () => {
  const config = (await import('../deploy/cloudflare.config')).default as unknown as { worker: { env: Record<string, { simple: unknown; namespace: string }> } }
  expect(config.worker.env.CHAT_RATE_LIMIT!.simple).toEqual(CHAT_RATE_LIMIT)
  expect(config.worker.env.VIEW_RATE_LIMIT!.simple).toEqual(VIEW_RATE_LIMIT)
  // apps/api の評価の検索（1001）と同じ namespace を使わない
  expect(new Set(['1001', config.worker.env.CHAT_RATE_LIMIT!.namespace, config.worker.env.VIEW_RATE_LIMIT!.namespace]).size).toBe(3)
})

describe('会話の token', () => {
  test('発行した token はその会話の ID を返す', async () => {
    const s = await issueSession(SECRET)
    expect(await verifySession(SECRET, `Bearer ${s.token}`)).toBe(s.id)
  })
  test('改ざん・別の鍵・期限切れ・形の崩れは 401', async () => {
    const s = await issueSession(SECRET)
    const [id, exp, sig] = s.token.split('.')
    const other = crypto.randomUUID()
    for (const header of [`Bearer ${other}.${exp}.${sig}`, `Bearer ${id}.${Number(exp) + 1}.${sig}`, `Bearer ${s.token}x`, `Bearer ${id}.${exp}.!!`, s.token, null, 'Bearer a.b'])
      await expect(verifySession(SECRET, header)).rejects.toMatchObject({ status: 401 })
    await expect(verifySession('other-secret', `Bearer ${s.token}`)).rejects.toMatchObject({ status: 401 })
    await expect(verifySession(SECRET, `Bearer ${s.token}`, (s.expiresAt + 1) * 1000)).rejects.toMatchObject({ status: 401 })
  })
  test('secret が無ければ止める', async () => {
    await expect(verifySession(undefined, 'Bearer x')).rejects.toMatchObject({ status: 503 })
  })
})

describe('Turnstile', () => {
  const fake = (result: unknown, seen: FormData[] = []) =>
    (async (url: string, init: RequestInit) => {
      expect(url).toBe(SITEVERIFY_URL)
      seen.push(init.body as FormData)
      return Response.json(result)
    }) as unknown as typeof fetch
  test('success・action・hostname が合えば通り、secret・token・IP を siteverify に送る', async () => {
    const seen: FormData[] = []
    await verifyTurnstile(SECRET, 'tok', '203.0.113.1', 'fudoki.dev', fake({ success: true, action: TURNSTILE_ACTION, hostname: 'fudoki.dev' }, seen))
    expect([seen[0]!.get('secret'), seen[0]!.get('response'), seen[0]!.get('remoteip')]).toEqual([SECRET, 'tok', '203.0.113.1'])
  })
  test('失敗・別の action・別の hostname は 403', async () => {
    for (const result of [{ success: false }, { success: true, action: 'other', hostname: 'fudoki.dev' }, { success: true, action: TURNSTILE_ACTION, hostname: 'evil.example' }])
      await expect(verifyTurnstile(SECRET, 'tok', '', 'fudoki.dev', fake(result))).rejects.toMatchObject({ status: 403 })
  })
  test('token が無い・長すぎるなら siteverify を呼ばずに 400、secret が無ければ 503', async () => {
    const never = (async () => {
      throw new Error('called')
    }) as unknown as typeof fetch
    for (const token of [undefined, '', 1, 'x'.repeat(2049)]) await expect(verifyTurnstile(SECRET, token, '', 'fudoki.dev', never)).rejects.toMatchObject({ status: 400 })
    await expect(verifyTurnstile(undefined, 'tok', '', 'fudoki.dev', never)).rejects.toMatchObject({ status: 503 })
  })
  test('siteverify に届かなければ 502（通さない）', async () => {
    const down = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    await expect(verifyTurnstile(SECRET, 'tok', '', 'fudoki.dev', down)).rejects.toMatchObject({ status: 502 })
  })
})

describe('View の中継の許可リスト', () => {
  test('データの tool と風土記の View だけを通す', () => {
    expect(parseRelay({ method: 'tools/call', params: { name: 'search_expenditure_nodes', arguments: { page_size: 1 } } })).toMatchObject({ params: { name: 'search_expenditure_nodes' } })
    expect(parseRelay({ method: 'resources/read', params: { uri: 'ui://fudoki/view-06a8e196f6a7.html' } })).toMatchObject({ method: 'resources/read' })
  })
  test('描画 tool・評価の検索・他の method・他の resource は 403', () => {
    for (const body of [
      { method: 'tools/call', params: { name: 'render_expenditure_view', arguments: {} } },
      { method: 'tools/call', params: { name: 'search_evaluations', arguments: {} } },
      { method: 'tools/call', params: { name: '__proto__' } },
      { method: 'tools/list', params: {} },
      { method: 'resources/read', params: { uri: 'ui://other/view.html' } },
      { method: 'resources/read', params: { uri: 'https://api.fudoki.dev/mcp' } },
      { method: 'resources/read', params: { uri: 'ui://fudoki/../x' } },
    ])
      expect(() => parseRelay(body)).toThrow(expect.objectContaining({ status: 403 }))
  })
})

describe('会話の入力の上限', () => {
  const user = (text: string, id = crypto.randomUUID()) => ({ id, role: 'user', parts: [{ type: 'text', text }] })
  test('文字数・件数・role・最後の発言を検査する', () => {
    const id = crypto.randomUUID()
    expect(parseChat({ id, messages: [user('a'.repeat(MAX_USER_TEXT))] }).messages).toHaveLength(1)
    expect(() => parseChat({ id, messages: [user('a'.repeat(MAX_USER_TEXT + 1))] })).toThrow(expect.objectContaining({ status: 413 }))
    expect(() => parseChat({ id, messages: Array.from({ length: MAX_MESSAGES + 1 }, () => user('a')) })).toThrow(expect.objectContaining({ status: 413 }))
    expect(() => parseChat({ id, messages: [{ id: 'x', role: 'system', parts: [{ type: 'text', text: 'a' }] }] })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => parseChat({ id, messages: [{ id: 'x', role: 'user', parts: [{ type: 'file', url: 'data:' }] }] })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => parseChat({ id, messages: [user('a'), { id: 'y', role: 'assistant', parts: [] }] })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => parseChat({ id, messages: [user('a')], viewContext: 'x'.repeat(2001) })).toThrow(expect.objectContaining({ status: 400 }))
  })
  test('AI の発言から reasoning を落とす', () => {
    const parsed = parseChat({ id: 'x', messages: [{ id: 'a', role: 'assistant', parts: [{ type: 'reasoning', text: 'x' }, { type: 'text', text: 'ok' }] }, user('b')] })
    expect(parsed.messages[0]!.parts).toEqual([{ type: 'text', text: 'ok' }])
  })
})

describe('/api/* の入口', () => {
  test('会話の token が無ければ chat も中継も 401、POST 以外は 405、別のサイトからは 403', async () => {
    expect((await call(post('/api/chat', {}), env())).status).toBe(401)
    expect((await call(post('/api/mcp', {}), env())).status).toBe(401)
    const get = await call(new Request('https://fudoki.dev/api/chat'), env())
    expect([get.status, get.headers.get('Allow')]).toEqual([405, 'POST'])
    expect((await call(post('/api/sessions', {}, { Origin: 'https://evil.example' }), env())).status).toBe(403)
  })
  test('流量を超えたら 429 と Retry-After、binding が無ければ 503', async () => {
    const s = await issueSession(SECRET)
    const auth = { Authorization: `Bearer ${s.token}` }
    const limited = await call(post('/api/chat', { id: s.id, messages: [] }, auth), env({ CHAT_RATE_LIMIT: deny }))
    expect([limited.status, limited.headers.get('Retry-After')]).toEqual([429, String(CHAT_RATE_LIMIT.period)])
    const relay = await call(post('/api/mcp', {}, auth), env({ VIEW_RATE_LIMIT: deny }))
    expect([relay.status, relay.headers.get('Retry-After')]).toEqual([429, String(VIEW_RATE_LIMIT.period)])
    expect((await call(post('/api/sessions', { turnstileToken: 't' }), env({ CHAT_RATE_LIMIT: undefined }))).status).toBe(503)
  })
  test('別の会話の token では送れない', async () => {
    const s = await issueSession(SECRET)
    const res = await call(post('/api/chat', { id: crypto.randomUUID(), messages: [{ id: 'a', role: 'user', parts: [{ type: 'text', text: 'a' }] }] }, { Authorization: `Bearer ${s.token}` }), env())
    expect(res.status).toBe(403)
  })
  test('body の上限を超えたら 413', async () => {
    const s = await issueSession(SECRET)
    const res = await call(post('/api/mcp', { method: 'tools/call', params: { name: 'list_jurisdictions', arguments: { x: 'a'.repeat(20_000) } } }, { Authorization: `Bearer ${s.token}` }), env())
    expect(res.status).toBe(413)
  })
})

test('上流の MCP が JSON でない応答を返したら 502', async () => {
  const s = await issueSession(SECRET)
  const API = { fetch: async () => new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }) }
  const res = await call(post('/api/mcp', { method: 'tools/call', params: { name: 'list_jurisdictions', arguments: {} } }, { Authorization: `Bearer ${s.token}` }), env({ API }))
  expect(res.status).toBe(502)
})

describe('ログに会話を残さない', () => {
  test('AI のエラーは requestBodyValues と responseBody を落とし、名前・短い文言・状態だけを出す', async () => {
    const { APICallError, RetryError } = await import('ai')
    const { safeError } = await import('./log')
    const secret = '利用者の質問の全文'
    const apiError = new APICallError({
      message: 'x'.repeat(500),
      url: 'https://api.cloudflare.com/ai/run',
      requestBodyValues: { messages: [{ role: 'user', content: secret }] },
      statusCode: 500,
      responseBody: `{"echo":"${secret}"}`,
      cause: new TypeError('fetch failed'),
    })
    const retry = new RetryError({ message: 'failed after retries', reason: 'maxRetriesExceeded', errors: [apiError] })
    for (const e of [apiError, retry]) {
      const out = safeError(e)
      const text = JSON.stringify(out)
      expect(text).not.toContain(secret)
      expect(text).not.toContain('requestBodyValues')
      expect(text).not.toContain('responseBody')
      expect(out.message!.length).toBeLessThanOrEqual(201)
    }
    expect(safeError(apiError)).toMatchObject({ name: 'AI_APICallError', statusCode: 500, cause: 'TypeError' })
    expect(safeError(retry)).toMatchObject({ name: 'AI_RetryError', lastError: 'AI_APICallError' })
  })
})
