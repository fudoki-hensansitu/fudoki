import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import { toolFor, type Json, type ViewData } from './types'

interface Entry {
  tool: string
  args: Json
  data: ViewData
  revision: number
}
interface State {
  entry?: Entry
  history: Entry[]
  busy: boolean
  error?: string
  apiOrigin: string
}

function appendData(previous: ViewData, next: ViewData): ViewData {
  const origins = [
    ...new Map(
      [...(previous.origins ?? []), ...(next.origins ?? [])].map((o) => [
        o.origin_id,
        o,
      ]),
    ).values(),
  ]
  if ('jurisdictions' in previous && 'jurisdictions' in next)
    return {
      ...next,
      jurisdictions: [...previous.jurisdictions, ...next.jurisdictions],
      origins,
    }
  if ('nodes' in previous && 'nodes' in next)
    return { ...next, nodes: [...previous.nodes, ...next.nodes], origins }
  if ('node' in previous && 'node' in next) {
    const children = { ...previous.children }
    for (const [axis, rows] of Object.entries(next.children))
      children[axis] = [...(children[axis] ?? []), ...rows]
    return { ...next, children, origins }
  }
  throw new Error('追加ページの形式が一致しません')
}

/** 接続はReactのeffectから独立させ、StrictModeの購読再実行でも一度だけ開始する。 */
export function createBridge() {
  const app = new App(
    { name: 'fudoki-view', version: '1.0.0' },
    {},
    { autoResize: false },
  )
  let state: State = {
    history: [],
    busy: true,
    apiOrigin: 'https://api.fudoki.dev',
  }
  const listeners = new Set<() => void>()
  let args: Json = {}
  let epoch = 0
  let request: AbortController | undefined
  let disposed = false
  let connecting: Promise<void> | undefined
  let observer: ResizeObserver | undefined
  let resizeFrame = 0
  let lastSize = ''
  const resize = () => {
    if (disposed || resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      if (disposed) return
      const height = Math.ceil(document.body.getBoundingClientRect().height)
      const width = window.innerWidth
      const size = `${width}:${height}`
      if (size !== lastSize) {
        lastSize = size
        void app.sendSizeChanged({ width, height }).catch(() => {})
      }
    })
  }
  const update = (patch: Partial<State>) => {
    if (disposed) return
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  const invalidate = () => {
    epoch++
    request?.abort()
    request = undefined
  }
  const applyHost = (ctx: McpUiHostContext | undefined) => {
    if (!ctx) return
    if (ctx.theme) applyDocumentTheme(ctx.theme)
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
    if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
  }
  const message = (result: { content?: unknown[] }) => {
    const item = result.content?.find(
      (c) => !!c && typeof c === 'object' && 'type' in c && c.type === 'text',
    )
    return item && typeof item === 'object' && 'text' in item
      ? String(item.text)
      : '結果がありません'
  }
  app.ontoolinput = (params) => {
    invalidate()
    args = (params.arguments ?? {}) as Json
    update({ busy: true, error: undefined })
  }
  app.ontoolresult = (result) => {
    invalidate()
    const origin =
      typeof result._meta?.apiOrigin === 'string'
        ? result._meta.apiOrigin
        : state.apiOrigin
    const data = result.structuredContent as Json | undefined
    const tool = data && toolFor(data)
    if (result.isError || !data || !tool) {
      update({
        entry: undefined,
        history: [],
        busy: false,
        error: data && !tool ? '表示できない結果です' : message(result),
        apiOrigin: origin,
      })
      return
    }
    update({
      entry: { tool, args, data: data as ViewData, revision: epoch },
      history: [],
      busy: false,
      error: undefined,
      apiOrigin: origin,
    })
  }
  app.ontoolcancelled = () => {
    invalidate()
    update({ busy: false, error: '取得がキャンセルされました' })
  }
  app.onhostcontextchanged = () => applyHost(app.getHostContext())

  return {
    app,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    connect: () =>
      (connecting ??= app
        .connect()
        .then(() => {
          if (disposed) {
            void app.close()
            return
          }
          applyHost(app.getHostContext())
          observer = new ResizeObserver(resize)
          observer.observe(document.body)
          window.addEventListener('resize', resize)
          resize()
        })
        .catch((error) => {
          update({ busy: false, error: `接続に失敗しました: ${String(error)}` })
        })),
    async call(tool: string, input: Json, mode: 'drill' | 'append', historyIndex?: number) {
      if (disposed || state.busy || !state.entry) return
      const previous = historyIndex === undefined ? state.entry : state.history[historyIndex]
      if (!previous) return
      const id = ++epoch
      request = new AbortController()
      update({ busy: true, error: undefined })
      try {
        const result = await app.callServerTool(
          { name: tool, arguments: input },
          { signal: request.signal },
        )
        if (disposed || id !== epoch) return
        const data = result.structuredContent as Json | undefined
        if (result.isError || !data) throw new Error(message(result))
        if (toolFor(data) !== tool) throw new Error('表示できない結果です')
        const combined =
          mode === 'append'
            ? appendData(previous.data, data as ViewData)
            : (data as ViewData)
        update({
          entry: {
            tool,
            args: input,
            data: combined,
            revision: mode === 'append' ? previous.revision : id,
          },
          history:
            mode === 'drill'
              ? [...(historyIndex === undefined ? state.history : state.history.slice(0, historyIndex)), previous]
              : state.history,
          apiOrigin:
            typeof result._meta?.apiOrigin === 'string'
              ? result._meta.apiOrigin
              : state.apiOrigin,
        })
      } catch (error) {
        if (!disposed && id === epoch)
          update({
            error: `取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          })
      } finally {
        if (id === epoch) {
          request = undefined
          update({ busy: false })
        }
      }
    },
    back() {
      invalidate()
      const entry = state.history.at(-1)
      if (entry)
        update({
          entry,
          history: state.history.slice(0, -1),
          busy: false,
          error: undefined,
        })
    },
    openLink: (url: string) => {
      void app
        .openLink({ url })
        .catch((error) =>
          update({ error: `原典を開けませんでした: ${String(error)}` }),
        )
    },
    dispose() {
      if (disposed) return
      invalidate()
      disposed = true
      listeners.clear()
      observer?.disconnect()
      cancelAnimationFrame(resizeFrame)
      window.removeEventListener('resize', resize)
      void app.close()
    },
  }
}
export type Bridge = ReturnType<typeof createBridge>
