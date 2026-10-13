import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { McpServer, createMcpHandler, preloadSchemas } from '@modelcontextprotocol/server'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import iconSvg from '../../web/public/favicon.svg' with { type: 'text' }
import type { Env } from './db'
import { ApiError, errorBody, invalid } from './errors'
import { operations, type Ctx, type Operation } from './operations'
import { VIEW_HTML, VIEW_URI } from './view.generated'

type AppEnv = { Bindings: Env; Variables: { ctx: Ctx; json: unknown } }

const MCP_ICON_SRC = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(iconSvg)))}`

const MAX_BODY_BYTES = 16 * 1024

const JSON_CONTENT_TYPE = /^application\/json\s*(;.*)?$/i

/** body を実際に読んだバイト数で数える（Content-Length は信用しない）。上限を超えたら読むのをやめる。 */
async function readLimitedText(req: Request): Promise<string> {
  const tooLarge = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', `リクエストの body は ${MAX_BODY_BYTES} バイトまでです`)
  if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) throw tooLarge() // 早く断るだけで、検査は読んだ量で行う
  const chunks: Uint8Array[] = []
  let total = 0
  if (req.body) {
    // ストリームの終わりか上限の超過で必ず終わる
    for await (const chunk of req.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength
      if (total > MAX_BODY_BYTES) throw tooLarge()
      chunks.push(chunk)
    }
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw invalid('body は UTF-8 の JSON にしてください')
  }
}

/** JSON を読む。どの階層でも `__proto__` のキーがあれば 400。 */
export function parseJsonBody(text: string): unknown {
  try {
    return JSON.parse(text, (key, value) => {
      if (key === '__proto__') throw invalid('__proto__ のキーは使えません')
      return value
    })
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw invalid('body が JSON ではありません')
  }
}

const HTTP_CODES: Record<number, string> = {
  400: 'INVALID_ARGUMENT',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
}

const jsonRpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null })

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

/** `/openapi.json` と apps/docs の API リファレンスが同じ文書を使う */
export const OPENAPI_CONFIG = {
  openapi: '3.1.0',
  info: { title: '風土記 API', version: '1.0.0', description: '町の家計簿を作る。自治体の歳出の予算・決算を事業の単位まで集約したデータ。' },
  servers: [{ url: 'https://api.fudoki.dev' }],
}

const mask = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, true])) as Record<string, true>

function registerRest(app: OpenAPIHono<AppEnv>, op: Operation) {
  const post = op.method === 'post'
  const params = !post && op.pathParams.length > 0 ? op.input.pick(mask(op.pathParams)) : undefined
  const query = post ? undefined : (op.restQuery ?? op.input.omit(mask(op.pathParams)))
  const route = createRoute({
    method: op.method,
    path: op.path,
    operationId: op.name,
    summary: op.summary,
    description: op.description,
    request: {
      ...(params ? { params } : {}),
      ...(query ? { query } : {}),
      ...(post ? { body: { required: true, content: { 'application/json': { schema: op.input, ...(op.example ? { example: op.example } : {}) } } } } : {}),
    },
    responses: {
      200: { description: '成功', content: { 'application/json': { schema: op.output } } },
      400: { description: '入力が不正', content: { 'application/json': { schema: ErrorBody } } },
      404: { description: '見つからない', content: { 'application/json': { schema: ErrorBody } } },
      ...(post
        ? {
            413: { description: `body が ${MAX_BODY_BYTES} バイトを超える`, content: { 'application/json': { schema: ErrorBody } } },
            415: { description: 'Content-Type が application/json でない', content: { 'application/json': { schema: ErrorBody } } },
          }
        : {}),
      503: { description: '提供を止めている', content: { 'application/json': { schema: ErrorBody } } },
    },
  })
  app.openapi(route as never, (async (c: Context<AppEnv>) => {
    const req = c.req as unknown as { valid(target: string): Record<string, unknown> }
    const input = post ? req.valid('json') : { ...(params ? req.valid('param') : {}), ...req.valid('query') }
    return c.json(await op.run(c.get('ctx'), input))
  }) as never)
}

// SDK の schema 群は初回の要求で遅延構築される（冷えた isolate の初回で CPU 約 40ms）。
// module scope なら起動時の処理で、要求ごとの cpuMs に数えられない。
preloadSchemas()

/** MCP Apps（io.modelcontextprotocol/ui）の View の HTML の MIME type */
export const VIEW_MIME_TYPE = 'text/html;profile=mcp-app'

function mcpServer(ctx: Ctx): McpServer {
  const server = new McpServer(
    {
      name: 'fudoki-api',
      title: '風土記(fudoki)',
      version: '1.0.0',
      icons: [{ src: MCP_ICON_SRC, mimeType: 'image/svg+xml', sizes: ['any'] }],
    },
    // stateless で tool・resource の一覧は変わらず、通知を送る経路も無いので、listChanged は名乗らない
    { capabilities: { tools: { listChanged: false }, resources: { listChanged: false } } }
  )
  // MCP Apps に対応した host は、tool の _meta.ui.resourceUri の View に結果を描く。非対応の client は _meta を無視し、structuredContent と text だけを使う。
  // stateless なので client の対応を見て出し分けられない（2025 年代の client は要求ごとに initialize を送らない）。そのため常に付ける
  server.registerResource(
    'view',
    VIEW_URI,
    { title: '風土記の表示', description: '団体と収録範囲・歳出のノードを表にする View（MCP Apps）。', mimeType: VIEW_MIME_TYPE },
    // URI に中身のハッシュを入れてあり、同じ URI の中身は変わらない
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: VIEW_MIME_TYPE, text: VIEW_HTML, _meta: { ui: { prefersBorder: true } } }] })
  )
  for (const op of operations) {
    server.registerTool(
      op.name,
      {
        title: op.summary,
        description: op.description,
        inputSchema: op.input,
        outputSchema: op.output,
        // すべての tool は D1 の読み取りだけで、状態を変えず、外部にも出ない
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        // 旧キー ui/resourceUri は ext-apps の registerAppTool と同じく併記する（仕様では GA 前に外す deprecated）
        ...(op.view ? { _meta: { ui: { resourceUri: VIEW_URI }, 'ui/resourceUri': VIEW_URI } } : {}),
      },
      async (args: Record<string, unknown>) => {
        try {
          const out = await op.run(ctx, args)
          // structuredContent が正本。text は structuredContent を読めない client のための同じ内容の写し（MCP の SHOULD）
          return { content: [{ type: 'text' as const, text: JSON.stringify(out) }], structuredContent: out as Record<string, unknown> }
        } catch (e) {
          // 想定外の例外の詳細（SQL のエラーなど）は返さず、ログにだけ出す
          if (!(e instanceof ApiError)) console.error(e)
          const body = e instanceof ApiError ? errorBody(e.code, e.message) : errorBody('INTERNAL', '内部エラー')
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(body) }] }
        }
      }
    )
  }
  return server
}

export function createApp() {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) return
      const message = result.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ')
      return c.json(errorBody('INVALID_ARGUMENT', message), 400)
    },
  })

  // すべての応答（成功・エラー）をキャッシュさせない
  app.use('*', async (c, next) => {
    await next()
    c.res.headers.set('Cache-Control', 'no-store')
  })

  // kill switch: control の serving が 'on' 以外なら 503。読めないときも止める。
  app.use('*', async (c, next) => {
    // /health は D1 を読まない（叩かれても課金が増えず、kill switch が off でも Worker の生死を返す）
    if (c.req.path === '/health') return next()
    let on = false
    try {
      const row = await c.env.DB.prepare(`SELECT value FROM control WHERE key = 'serving'`).first<{ value: string }>()
      on = row?.value === 'on'
    } catch {
      on = false
    }
    if (!on) {
      return c.json(errorBody('UNAVAILABLE', '提供を停止しています'), 503, { 'Cache-Control': 'no-store' })
    }
    c.set('ctx', { db: c.env.DB })
    await next()
  })

  // POST の body は、Content-Type・実際のバイト数・UTF-8・`__proto__` を検査してから使う。
  app.use('*', async (c, next) => {
    if (c.req.method !== 'POST' || c.req.path === '/health') return next()
    const isMcp = new URL(c.req.url).pathname === '/mcp'
    try {
      if (!JSON_CONTENT_TYPE.test(c.req.header('content-type') ?? ''))
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type は application/json にしてください')
      const text = await readLimitedText(c.req.raw)
      c.set('json', parseJsonBody(text))
      // zod-openapi の validator と MCP の transport が同じ text を読む
      ;(c.req.bodyCache as Record<string, unknown>).text = Promise.resolve(text)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      if (!isMcp) throw e
      return c.json(jsonRpcError(e.status === 400 ? -32700 : -32600, e.message), e.status)
    }
    return next()
  })

  app.get('/', (c) => {
    const origin = new URL(c.req.url).origin
    return c.json({
      name: '風土記 API',
      rest: `${origin}/v1/expenditure/nodes:search`,
      jurisdictions: `${origin}/v1/jurisdictions`,
      openapi: `${origin}/openapi.json`,
      health: `${origin}/health`,
      mcp: `${origin}/mcp`,
    })
  })

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      operationId: 'health',
      summary: '死活確認',
      description: 'Worker が応答できるかだけを返す。D1 は読まず、kill switch の状態に依らず 200 を返す。',
      responses: { 200: { description: '稼働中', content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } } } },
    }),
    (c) => c.json({ status: 'ok' as const }, 200)
  )
  app.all('/health', (c) => c.json(errorBody('METHOD_NOT_ALLOWED', 'GET だけを受け付けます'), 405, { Allow: 'GET' }))

  for (const op of operations) registerRest(app, op)

  app.doc31('/openapi.json', OPENAPI_CONFIG)

  // Workers はリクエストをまたいで状態を持てないので、リクエストごとに handler を作る。
  // 2026-07-28 の規格（initialize なし・Mcp-Session-Id なし）を話し、2025 年代の client も legacy: 'stateless' で1要求ずつ捌く。
  app.all('/mcp', async (c) => {
    if (c.req.method !== 'POST')
      return c.json(errorBody('INVALID_ARGUMENT', 'MCP は POST だけを受け付けます'), 405, { Allow: 'POST' })
    // JSON-RPC の batch は1回の HTTP で検索を何十件も実行できるので、単一の要求だけを受ける。
    const body = c.get('json')
    if (Array.isArray(body)) return c.json(jsonRpcError(-32600, 'JSON-RPC の batch は受け付けません。要求を1つずつ送ってください'), 400)
    // subscriptions/listen は SSE を開いたままにする長い接続で、Workers では持てない（通知を流す元も無い）。
    if ((body as { method?: unknown } | null)?.method === 'subscriptions/listen')
      return c.json({ ...jsonRpcError(-32601, 'subscriptions/listen は受け付けません'), id: (body as { id?: unknown }).id ?? null }, 400)
    const ctx = c.get('ctx')
    const handler = createMcpHandler(() => mcpServer(ctx), {
      legacy: 'stateless',
      // 'json' だと要求ごとに「通知が落ちる」警告が console に出る。tool は途中の通知を出さないので auto でも JSON 1つで返る
      responseMode: 'auto',
      maxRequestBodySize: MAX_BODY_BYTES,
      // 内部エラーの詳細は応答に出さず、ログにだけ残す
      onerror: (e) => console.error(e),
    })
    // body は上で検査済み。handler には parse 済みの値を渡し、二重に読ませない
    return handler.fetch(c.req.raw, { parsedBody: body })
  })

  app.notFound((c) => c.json(errorBody('NOT_FOUND', '存在しないパスです'), 404))

  app.onError((e, c) => {
    if (e instanceof ApiError) return c.json(errorBody(e.code, e.message), e.status)
    if (e instanceof HTTPException) {
      // 415・406 などは 500 にしない。MCP の transport は JSON-RPC の形の応答を持っている
      if (e.res) return e.getResponse()
      return c.json(errorBody(HTTP_CODES[e.status] ?? 'INVALID_ARGUMENT', e.message), e.status)
    }
    console.error(e)
    return c.json(errorBody('INTERNAL', '内部エラー'), 500)
  })
  return app
}
