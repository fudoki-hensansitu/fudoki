import { fixture } from './fixture'
const f = await fixture(process.argv.includes('--real'))
const build = await Bun.build({ entrypoints: [new URL('./host.ts', import.meta.url).pathname], target: 'browser', format: 'esm' })
if (!build.success) throw new AggregateError(build.logs)
const js = await build.outputs[0]!.text()
const server = Bun.serve({ idleTimeout: 30, port: Number(process.env.PORT ?? 4317), async fetch(req) {
  const path = new URL(req.url).pathname
  if (path === '/') return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><title>風土記 MCP Apps QA</title><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe title="風土記" sandbox="allow-scripts"></iframe><p id="opened"></p><script type="module" src="/host.js"></script></html>', { headers: { 'Content-Type': 'text/html' } })
  if (path === '/host.js') return new Response(js, { headers: { 'Content-Type': 'application/javascript' } })
  if (path === '/__stats') return Response.json(Object.fromEntries(f.hits))
  if (path === '/__reset') await f.reset()
  const response = await f.mf.dispatchFetch(req.url, { method: req.method, headers: req.headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: await req.text() } : {}) })
  return new Response(await response.arrayBuffer(), { status: response.status, headers: Object.fromEntries(response.headers) })
} })
console.log(`PDF QA host: ${server.url}`)
async function stop() { server.stop(true); await f.dispose(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
