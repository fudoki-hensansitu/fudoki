import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { McpServer, createMcpHandler, preloadSchemas } from '@modelcontextprotocol/server'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import iconSvg from './favicon.svg?raw'
import type { Env } from './db'
import { ApiError, errorBody, invalid } from './errors'
import { operations as defaultOperations, type Ctx, type Operation } from './operations'
import { VIEW_HTML, VIEW_URI } from './view.generated'
import { originPdf } from './origin-pdf'
import { JURISDICTION_TABLE } from './columns'
import { quotaOf } from './evaluation-quota'

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
const RateLimitedBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retry_after_seconds: z.int() }) })

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
      ...(op.rateLimited ? { 429: { description: '回数の上限を超えた。Retry-After 秒後に再試行する', headers: z.object({ 'Retry-After': z.string() }), content: { 'application/json': { schema: RateLimitedBody } } } } : {}),
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

/** View が団体コードの代わりに団体名を出すための対応。structuredContent の契約は変えず、MCP の _meta にだけ載せる */
async function jurisdictionNames(ctx: Ctx, out: unknown): Promise<Record<string, string>> {
  const o = out as { nodes?: { jurisdiction_code: string }[]; node?: { jurisdiction_code: string } }
  const codes = [...new Set([...(o.nodes ?? []), ...(o.node ? [o.node] : [])].map((n) => n.jurisdiction_code))]
  if (!codes.length) return {}
  // D1 は1文の bind を100個までに制限するので、100件ずつに分けて1つの batch で読む
  const chunks = Array.from({ length: Math.ceil(codes.length / 100) }, (_, i) => codes.slice(i * 100, i * 100 + 100))
  const pages = await ctx.db.batch<{ jurisdiction_code: string; name: string }>(
    chunks.map((c) =>
      ctx.db.prepare(`SELECT "jurisdiction_code", "name" FROM ${JURISDICTION_TABLE} WHERE "jurisdiction_code" IN (${c.map(() => '?').join(', ')})`).bind(...c)
    )
  )
  return Object.fromEntries(pages.flatMap((p) => p.results).map((r) => [r.jurisdiction_code, r.name]))
}

/** View を描く tool の名前。データを返す tool には View を付けず、この tool だけが View を指す（iframe を tool 呼び出しごとに作り直させないため） */
export const RENDER_TOOL = 'render_expenditure_view'

const RENDER_DESCRIPTION =
  '結果を画面（View）に表とグラフで表示する。データを調べる tool（search_expenditure_nodes・get_expenditure_node・list_jurisdictions）は結果を返すだけで画面を出さない。' +
  'ユーザーに結果を見せる最終段階で、その tool と同じ入力（tool と arguments）を渡してこの tool を一度だけ呼ぶ。' +
  'MCP Apps に対応した client では結果が画面に出るので、応答の文章で一覧や金額を繰り返さず、補足は問いへの答えと注意点だけの最小限にとどめる。'

function mcpServer(ctx: Ctx, apiOrigin: string, operations: Operation[]): McpServer {
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
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: VIEW_MIME_TYPE, text: VIEW_HTML, _meta: { ui: { prefersBorder: true, csp: { connectDomains: [apiOrigin] } } } }] })
  )
  const toolResult = async (op: Operation, args: Record<string, unknown>, withNames: boolean) => {
    try {
      const out = await op.run(ctx, args)
      // structuredContent が正本。text は structuredContent を読めない client のための同じ内容の写し（MCP の SHOULD）
      const meta = withNames ? { apiOrigin, jurisdictionNames: await jurisdictionNames(ctx, out) } : { apiOrigin }
      return { content: [{ type: 'text' as const, text: JSON.stringify(out) }], structuredContent: out as Record<string, unknown>, _meta: meta }
    } catch (e) {
      // 想定外の例外の詳細（SQL のエラーなど）は返さず、ログにだけ出す
      if (!(e instanceof ApiError)) console.error(e)
      const body = e instanceof ApiError ? errorBody(e.code, e.message, e.retryAfter) : errorBody('INTERNAL', '内部エラー')
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(body) }] }
    }
  }
  // どの tool も利用者の状態を変えない（評価の検索は回数の記録と AI Search の呼び出しを伴うが、風土記の内側で閉じる）
  // title は最上位と annotations の両方に書く（annotations.title は旧仕様の置き場所で、Claude の提出画面はこちらを見る）
  const annotations = (title: string) => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
  for (const op of operations) {
    server.registerTool(
      op.name,
      {
        title: op.summary,
        description: op.view ? `${op.description} 結果を画面に表示するときは、この tool ではなく ${RENDER_TOOL} を使う。` : op.description,
        inputSchema: op.input,
        outputSchema: op.output,
        annotations: annotations(op.summary),
      },
      // View が追加ページの取得や drill で直接呼ぶので、団体名の _meta はデータ tool にも付ける（描画 tool と同じ結果にする）
      (args: Record<string, unknown>) => toolResult(op, args, !!op.view)
    )
  }
  const RENDER_TITLE = '結果の表示'
  // View を描く tool は1つだけ。データ tool と同じ問い合わせを受けて結果を返し、View のテンプレートを指す
  const viewOps = operations.filter((op) => op.view)
  if (viewOps.length > 0) {
    const names = viewOps.map((op) => op.name) as [string, ...string[]]
    server.registerTool(
      RENDER_TOOL,
      {
        title: RENDER_TITLE,
        description: RENDER_DESCRIPTION,
        inputSchema: z.strictObject({
          tool: z.enum(names).describe('表示する結果を返す tool の名前。'),
          arguments: z.record(z.string(), z.unknown()).describe('その tool に渡す入力（データ tool の呼び出しと同じもの）。'),
        }),
        // outputSchema は付けない: 結果の形が tool 引数で変わる（対象 tool の output のどれか）ため、単一の schema にできない
        annotations: annotations(RENDER_TITLE),
        // 旧キー ui/resourceUri は ext-apps の registerAppTool と同じく併記する（仕様では GA 前に外す deprecated）
        _meta: { ui: { resourceUri: VIEW_URI }, 'ui/resourceUri': VIEW_URI },
      },
      async (args: { tool: string; arguments: Record<string, unknown> }) => {
        const op = viewOps.find((o) => o.name === args.tool)!
        const parsed = op.input.safeParse(args.arguments)
        if (!parsed.success) {
          const message = parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ')
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(errorBody('INVALID_ARGUMENT', message)) }] }
        }
        return toolResult(op, parsed.data as Record<string, unknown>, true)
      }
    )
  }
  return server
}

/** 公開する操作を差し替えられる（試験が一部の操作だけで app を作る）。 */
export function createApp(operations: Operation[] = defaultOperations) {
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

  // sandbox iframe は opaque origin（Origin: null）。PDF の公開中継だけ資格情報なしで読ませる。
  app.use('/v1/origins/:origin_id/pdf', async (c, next) => {
    await next()
    c.res.headers.set('Access-Control-Allow-Origin', '*')
    c.res.headers.set('Access-Control-Expose-Headers', 'X-Origin-Url, X-Origin-Fetched-At')
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
    c.set('ctx', {
      db: c.env.DB,
      evaluation: { search: c.env.EVALUATION_SEARCH, rateLimit: c.env.EVALUATION_RATE_LIMIT, quota: quotaOf(c.env.EVALUATION_QUOTA), ip: c.req.header('CF-Connecting-IP') },
    })
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

  app.openapi(createRoute({
    method: 'get', path: '/v1/origins/{origin_id}/pdf', operationId: 'get_origin_pdf',
    summary: '原典 PDF の表示用中継',
    description: '原典 ID が指す自治体の公開 PDF を中継する。32 MiB・20秒、取得6回/分（同一URL1回/分）、閲覧120回/分、成功PDFを24時間・最大16 URL保持。上限は全利用者合計。取得 URL（percent-encoding）と取得日時を X-Origin-Url・X-Origin-Fetched-At で返す。取り込み時の内容との一致は保証しない。query・任意 URL・リダイレクト・CSV は受け付けない。',
    request: { params: z.object({ origin_id: z.string().min(1).max(256) }) },
    responses: {
      200: { description: 'PDF', content: { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } } },
      ...Object.fromEntries([400, 404, 429, 502, 503, 504].map((status) => [status, { description: '表示できない', content: { 'application/json': { schema: ErrorBody } } }])),
    },
  }), async (c) => originPdf(c.env.DB, c.env.ORIGIN_PDF, c.req.raw, c.req.param('origin_id')))
  app.all('/v1/origins/:origin_id/pdf', (c) => c.json(errorBody('METHOD_NOT_ALLOWED', 'GET だけを受け付けます'), 405, { Allow: 'GET' }))

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
    const handler = createMcpHandler(() => mcpServer(ctx, new URL(c.req.url).origin, operations), {
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
    if (e instanceof ApiError) {
      return c.json(errorBody(e.code, e.message, e.retryAfter), e.status, e.retryAfter === undefined ? {} : { 'Retry-After': String(e.retryAfter) })
    }
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
