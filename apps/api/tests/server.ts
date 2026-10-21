import { watch } from 'node:fs'
import { fixture } from './fixture'
import { previewHtml } from './dev-preview'
import { renderHtml } from '../ui/build'

const preview = process.argv.includes('--preview')
const f = await fixture(process.argv.includes('--real'))
async function hostScript() {
  const build = await Bun.build({
    entrypoints: [new URL('./host.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'esm',
  })
  if (!build.success) throw new AggregateError(build.logs)
  return build.outputs[0]!.text()
}
function buildCache(build: () => Promise<string>) {
  let pending: Promise<string> | undefined
  return {
    get() {
      if (!pending) {
        const attempt = build().catch((error) => {
          if (pending === attempt) pending = undefined
          throw error
        })
        pending = attempt
      }
      return pending
    },
    clear() {
      pending = undefined
    },
  }
}
const hostBuild = buildCache(hostScript)
const viewBuild = buildCache(renderHtml)
const js = await hostBuild.get()
const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>()
const reload = () => {
  for (const client of reloadClients) {
    try {
      client.enqueue(new TextEncoder().encode('data: reload\n\n'))
    } catch {
      reloadClients.delete(client)
    }
  }
}
let reloadTimer: ReturnType<typeof setTimeout> | undefined
const sourceChanged = () => {
  hostBuild.clear()
  viewBuild.clear()
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(reload, 75)
}
const watchers = preview
  ? [
      ...['../ui', '../../../packages/ui/src'].map((path) =>
        watch(
          new URL(path, import.meta.url),
          { recursive: true },
          sourceChanged,
        ),
      ),
      ...['./host.ts', './ui-fixture.ts', './dev-preview.ts'].map((path) =>
        watch(new URL(path, import.meta.url), sourceChanged),
      ),
    ]
  : []
const server = Bun.serve({
  hostname: '127.0.0.1',
  idleTimeout: 30,
  port: Number(process.env.PORT ?? 4317),
  async fetch(req) {
    const path = new URL(req.url).pathname
    if (preview && path === '/')
      return Response.redirect(new URL('/preview?ui=search', req.url))
    if (preview && path === '/preview')
      return new Response(previewHtml(), {
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
      })
    if (preview && path === '/preview-view')
      return new Response(await viewBuild.get(), {
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
      })
    if (preview && path === '/preview-events') {
      let client: ReadableStreamDefaultController<Uint8Array>
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          client = controller
          reloadClients.add(controller)
          controller.enqueue(new TextEncoder().encode(': connected\n\n'))
          req.signal.addEventListener(
            'abort',
            () => {
              reloadClients.delete(controller)
            },
            { once: true },
          )
        },
        cancel() {
          reloadClients.delete(client)
        },
      })
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
        },
      })
    }
    if (path === '/')
      return new Response(
        '<!doctype html><html lang="ja"><meta charset="utf-8"><title>風土記 MCP Apps QA</title><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe title="風土記" sandbox="allow-scripts"></iframe><p id="opened"></p><script type="module" src="/host.js"></script></html>',
        { headers: { 'Content-Type': 'text/html' } },
      )
    if (path === '/host.js')
      return new Response(preview ? await hostBuild.get() : js, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      })
    if (path === '/__stats') return Response.json(Object.fromEntries(f.hits))
    if (path === '/__release-pdf') {
      f.releasePdf()
      return new Response('released')
    }
    if (path === '/__reset') await f.reset()
    const response = await f.mf.dispatchFetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: await req.text() }
        : {}),
    })
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: Object.fromEntries(response.headers),
    })
  },
})
console.log(
  `${preview ? 'MCP UI preview' : 'PDF QA host'}: ${server.url}${preview ? 'preview?ui=search' : ''}`,
)
async function stop() {
  clearTimeout(reloadTimer)
  for (const watcher of watchers) watcher.close()
  reloadClients.clear()
  server.stop(true)
  await f.dispose()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
