import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { StreamableHTTPTransport } from '@hono/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import type { Env } from './db'
import { ApiError, errorBody } from './errors'
import { operations, type Ctx, type Operation } from './operations'

type AppEnv = { Bindings: Env; Variables: { ctx: Ctx } }

const MAX_BODY_BYTES = 16 * 1024

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

const mask = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, true])) as Record<string, true>

function registerRest(app: OpenAPIHono<AppEnv>, op: Operation) {
  const post = op.method === 'post'
  const params = !post && op.pathParams.length > 0 ? op.input.pick(mask(op.pathParams)) : undefined
  const query = post ? undefined : op.input.omit(mask(op.pathParams))
  const route = createRoute({
    method: op.method,
    path: op.path,
    operationId: op.name,
    summary: op.summary,
    description: op.description,
    request: {
      ...(params ? { params } : {}),
      ...(query ? { query } : {}),
      ...(post ? { body: { required: true, content: { 'application/json': { schema: op.input } } } } : {}),
    },
    responses: {
      200: { description: '成功', content: { 'application/json': { schema: op.output } } },
      400: { description: '入力が不正', content: { 'application/json': { schema: ErrorBody } } },
      404: { description: '見つからない', content: { 'application/json': { schema: ErrorBody } } },
    },
  })
  app.openapi(route as never, (async (c: Context<AppEnv>) => {
    const req = c.req as unknown as { valid(target: string): Record<string, unknown> }
    const input = post ? req.valid('json') : { ...(params ? req.valid('param') : {}), ...req.valid('query') }
    return c.json(await op.run(c.get('ctx'), input))
  }) as never)
}

function mcpServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: 'fudoki-api', version: '1.0.0' })
  for (const op of operations) {
    server.registerTool(
      op.name,
      { description: op.description, inputSchema: op.input },
      async (args: Record<string, unknown>) => {
        try {
          const out = await op.run(ctx, args)
          return { content: [{ type: 'text' as const, text: JSON.stringify(out) }] }
        } catch (e) {
          if (!(e instanceof ApiError)) throw e
          return {
            isError: true,
            content: [{ type: 'text' as const, text: JSON.stringify(errorBody(e.code, e.message)) }],
          }
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

  // kill switch: control の serving が 'on' 以外なら 503。読めないときも止める。
  app.use('*', async (c, next) => {
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

  // 問い合わせの JSON は小さい。大きな body は読む前に 413 で断る。
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody('INVALID_ARGUMENT', `リクエストの body は ${MAX_BODY_BYTES} バイトまでです`), 413),
    })
  )

  app.get('/', (c) => {
    const origin = new URL(c.req.url).origin
    return c.json({
      name: '風土記 API',
      rest: `${origin}/v1/expenditure/nodes:search`,
      openapi: `${origin}/openapi.json`,
      mcp: `${origin}/mcp`,
    })
  })

  for (const op of operations) registerRest(app, op)

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: '風土記 API', version: '1.0.0', description: '自治体の歳出の予算・決算を事業単位（目）まで構造化したデータ。' },
  })

  // Workers はリクエストをまたいで状態を持てないので、リクエストごとに server と transport を作る。
  app.all('/mcp', async (c) => {
    if (c.req.method !== 'POST')
      return c.json(errorBody('INVALID_ARGUMENT', 'MCP は POST だけを受け付けます'), 405, { Allow: 'POST' })
    const server = mcpServer(c.get('ctx'))
    const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    return (await transport.handleRequest(c)) ?? c.body(null, 204)
  })

  app.onError((e, c) => {
    if (e instanceof ApiError) return c.json(errorBody(e.code, e.message), e.status)
    if (e instanceof HTTPException && e.status === 400) return c.json(errorBody('INVALID_ARGUMENT', e.message), 400)
    console.error(e)
    return c.json(errorBody('INTERNAL', '内部エラー'), 500)
  })
  return app
}
