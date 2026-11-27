import { beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { createApp } from './app'
import type { AuthDeps } from './auth/api-key'
import type { Db } from './db'
import { TEST_API_KEY, TEST_ORG_ID, TEST_USER_ID, authEnv, memoryCache, testDb, workosStub } from './testing'

const LIST = '/v1/jurisdictions'

let db: Db
let stub: ReturnType<typeof workosStub>
let cache: ReturnType<typeof memoryCache>
let app: ReturnType<typeof createApp>

const user = (organization_id: string, permissions: string[]) => ({ owner: { type: 'user', id: 'user_other', organization_id }, permissions })

beforeEach(() => {
  ;({ db } = testDb())
  stub = workosStub({
    sk_org_scope: { owner: { type: 'organization', id: TEST_ORG_ID }, permissions: ['fudoki:read'] },
    sk_other_org: user('org_other', ['fudoki:read']),
    sk_no_permission: user(TEST_ORG_ID, ['subsidy:read']),
  })
  cache = memoryCache()
  app = createApp({ fetch: stub.fetch, cache: () => cache })
})

const call = (path: string, headers: Record<string, string> = {}, env: Record<string, unknown> = {}) =>
  app.request(path, { headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } }, { DB: db, ...authEnv(), ...env })
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` })

describe('API キーが無い・無効', () => {
  test('header が無ければ 401 と WWW-Authenticate: Bearer', async () => {
    const res = await call(LIST)
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED')
  })

  test('OAuth のトークン（JWT）・接頭辞の違う値・長すぎる値は WorkOS を呼ばずに 401 と invalid_token', async () => {
    for (const key of ['eyJhbGciOiJSUzI1NiJ9.e30.sig', 'pk_live_abc', `sk_${'a'.repeat(300)}`]) {
      const res = await call(LIST, bearer(key))
      expect(res.status).toBe(401)
      expect(res.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"')
    }
    expect(stub.calls).toEqual([])
  })

  test('WorkOS が無効と答えたキーは 401', async () => {
    const res = await call(LIST, bearer('sk_unknown'))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"')
  })

  test('Basic など Bearer 以外の方式は 401', async () => {
    expect((await call(LIST, { Authorization: `Basic ${btoa('a:b')}` })).status).toBe(401)
  })

  test('資格情報の無い要求で D1 を読まない', async () => {
    const touched: string[] = []
    const spy: Db = { prepare: (sql) => (touched.push(sql), db.prepare(sql)), batch: (s) => db.batch(s) }
    await app.request(LIST, {}, { DB: spy, ...authEnv() })
    await app.request(LIST, { headers: bearer('sk_unknown') }, { DB: spy, ...authEnv() })
    expect(touched).toEqual([])
  })
})

describe('有効なキー', () => {
  test('通り、2回目は WorkOS を呼ばない。キャッシュの鍵にキーの値を使わない', async () => {
    expect((await call(LIST, bearer(TEST_API_KEY))).status).toBe(200)
    expect((await call(LIST, bearer(TEST_API_KEY))).status).toBe(200)
    expect(stub.calls).toEqual([TEST_API_KEY])
    expect([...cache.store.keys()].some((k) => k.includes(TEST_API_KEY))).toBe(false)
  })

  test('呼び出しを利用者 ID と route・status で1行記録する', async () => {
    const env = authEnv()
    await app.request(LIST, { headers: bearer(TEST_API_KEY) }, { DB: db, ...env })
    expect(env.points).toEqual([{ indexes: [TEST_USER_ID], blobs: [TEST_USER_ID, 'api_key', '', LIST], doubles: [200, expect.any(Number)] }])
  })

  test('利用者ごとの上限を超えたら 429', async () => {
    const res = await call(LIST, bearer(TEST_API_KEY), { API_CALLER_LIMIT: { limit: async ({ key }: { key: string }) => ({ success: key !== TEST_USER_ID }) } })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})

describe('権限の無いキー', () => {
  test('organization scope・developers 以外の organization・fudoki:read の無いキーは 403', async () => {
    for (const key of ['sk_org_scope', 'sk_other_org', 'sk_no_permission']) {
      const res = await call(LIST, bearer(key))
      expect(res.status).toBe(403)
      expect((await res.json()).error.code).toBe('PERMISSION_DENIED')
    }
  })
})

describe('query string の資格情報', () => {
  test('api_key・key・token・access_token が付いていれば値を使わずに 400', async () => {
    for (const name of ['api_key', 'key', 'token', 'access_token']) {
      expect((await call(`${LIST}?${name}=${TEST_API_KEY}`, bearer(TEST_API_KEY))).status).toBe(400)
    }
    expect(stub.calls).toEqual([])
  })
})

describe('検証に失敗し続ける IP', () => {
  test('上限を超えたら 429 にし、窓のあいだは WorkOS を呼ばない', async () => {
    expect((await call(LIST, bearer(TEST_API_KEY))).status).toBe(200)
    const env = { API_KEY_FAILURES: { limit: async () => ({ success: false }) } }
    expect((await call(LIST, bearer('sk_unknown1'), env)).status).toBe(429)
    expect((await call(LIST, bearer('sk_unknown2'))).status).toBe(429)
    expect(stub.calls).toEqual([TEST_API_KEY, 'sk_unknown1'])
    // 検証の済んだキーは、同じ IP（NAT の相乗り）からでも通る
    expect((await call(LIST, bearer(TEST_API_KEY))).status).toBe(200)
  })
})

describe('WorkOS が落ちている', () => {
  for (const [name, fetch] of [
    ['5xx', async () => new Response('', { status: 502 })],
    ['timeout', async () => Promise.reject(new DOMException('timeout', 'TimeoutError'))],
    ['風土記の secret が無効（401）', async () => new Response('', { status: 401 })],
    ['200 で JSON でない本文', async () => new Response('<html>', { status: 200 })],
    ['200 で想定外の形', async () => Response.json({ api_key: { id: 'k' } })],
  ] as const) {
    test(`${name} は 503 で、結果を置かない`, async () => {
      spyOn(console, 'error').mockImplementation(() => {})
      const deps: AuthDeps = { fetch, cache: () => cache }
      const down = createApp(deps)
      const res = await down.request(LIST, { headers: bearer(TEST_API_KEY) }, { DB: db, ...authEnv() })
      expect(res.status).toBe(503)
      expect(cache.store.size).toBe(0)
    })
  }

  test('ログにキーの値を出さない', async () => {
    const logged: unknown[] = []
    spyOn(console, 'error').mockImplementation((...args) => void logged.push(...args))
    const down = createApp({ fetch: async () => Promise.reject(new Error(`boom ${TEST_API_KEY}`)), cache: () => cache })
    await down.request(LIST, { headers: bearer(TEST_API_KEY) }, { DB: db, ...authEnv() })
    expect(logged.length).toBeGreaterThan(0)
    expect(JSON.stringify(logged.map(String))).not.toContain(TEST_API_KEY)
  })
})

describe('キーなしで読める口', () => {
  test('/・/health・/openapi.json・/robots.txt と MCP は API キーを求めない', async () => {
    for (const path of ['/', '/health', '/openapi.json', '/robots.txt']) expect((await call(path)).status).toBe(200)
  })

  test('出典の PDF の中継は API キーを求めず、CORS * のまま', async () => {
    const res = await call('/v1/expenditures/origins/none/pdf')
    expect(res.status).not.toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  test('/v1/ の下は CORS を許さない（preflight も 401）', async () => {
    const pre = await call(LIST, { Origin: 'https://example.test', 'Access-Control-Request-Method': 'GET' })
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull()
    const opt = await app.request(LIST, { method: 'OPTIONS', headers: { Origin: 'https://example.test', 'Access-Control-Request-Method': 'GET' } }, { DB: db, ...authEnv() })
    expect(opt.status).toBe(401)
    expect(opt.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('/openapi.json', () => {
  test('Bearer の securityScheme を持ち、PDF の中継だけ security が空', async () => {
    const doc = await (await call('/openapi.json')).json()
    expect(doc.components.securitySchemes.apiKey).toMatchObject({ type: 'http', scheme: 'bearer' })
    expect(doc.security).toEqual([{ apiKey: [] }])
    expect(doc.paths['/v1/expenditures/origins/{origin_id}/pdf'].get.security).toEqual([])
    expect(doc.paths['/v1/jurisdictions'].get.security).toBeUndefined()
  })
})

