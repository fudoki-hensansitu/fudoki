import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import { toolFor, type Json, type TreeNode, type ViewData } from './types'

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
  /** 団体コード → 団体名。server が結果の _meta に載せる */
  names: Record<string, string>
  fullscreen: { available: boolean; active: boolean }
}

const namesOf = (meta: Record<string, unknown> | undefined) => {
  const names = meta?.jurisdictionNames
  return names && typeof names === 'object' ? (names as Record<string, string>) : {}
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
    { availableDisplayModes: ['inline', 'fullscreen'] },
    { autoResize: false },
  )
  let state: State = {
    history: [],
    busy: true,
    apiOrigin: 'https://api.fudoki.dev',
    names: {},
    fullscreen: { available: false, active: false },
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
    update({
      fullscreen: {
        available: !!ctx.availableDisplayModes?.includes('fullscreen'),
        active: ctx.displayMode === 'fullscreen',
      },
    })
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
      names: { ...state.names, ...namesOf(result._meta) },
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
    async call(tool: string, input: Json, mode: 'drill' | 'append') {
      if (disposed || state.busy || !state.entry) return
      const previous = state.entry
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
          history: mode === 'drill' ? [...state.history, previous] : state.history,
          names: { ...state.names, ...namesOf(result._meta) },
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
    /**
     * 通っていない上位の科目（款・項）へ、親を辿って移る。目から開いた明細でも款・項に上がれるようにする。
     * 移った先より深い明細の履歴は経路と食い違うので捨て、一覧だけを残す。
     */
    async climbTo(from: TreeNode, kind: string, name: string) {
      if (disposed || state.busy || !state.entry) return
      const id = ++epoch
      request = new AbortController()
      update({ busy: true, error: undefined })
      try {
        let parentId = from.parent_node_id
        // 節・事業から款までの段数に余裕を持たせた上限。データの循環で止まらなくならないようにする
        for (let step = 0; step < 5 && parentId; step++) {
          const args = { document_kind: from.document_kind, node_id: parentId }
          const result = await app.callServerTool({ name: 'get_expenditure_node', arguments: args }, { signal: request.signal })
          if (disposed || id !== epoch) return
          const data = result.structuredContent as Json | undefined
          if (result.isError || !data || toolFor(data) !== 'get_expenditure_node') throw new Error(result.isError ? message(result) : '表示できない結果です')
          const node = (data as Extract<ViewData, { node: TreeNode }>).node
          if (node.node_kind === kind && node.name === name) {
            update({
              entry: { tool: 'get_expenditure_node', args, data: data as ViewData, revision: id },
              history: state.history.filter((e) => !('node' in e.data)),
              names: { ...state.names, ...namesOf(result._meta) },
            })
            return
          }
          parentId = node.parent_node_id
        }
        throw new Error(`${name}まで辿れませんでした`)
      } catch (error) {
        if (!disposed && id === epoch)
          update({ error: `取得に失敗しました: ${error instanceof Error ? error.message : String(error)}` })
      } finally {
        if (id === epoch) {
          request = undefined
          update({ busy: false })
        }
      }
    },
    /** 経路の index 番目の画面に戻り、その先の履歴を捨てる */
    backTo(index: number) {
      invalidate()
      const entry = state.history[index]
      if (entry)
        update({
          entry,
          history: state.history.slice(0, index),
          busy: false,
          error: undefined,
        })
    },
    /** 全画面に対応しない host では何もしない（View はその場で表示を差し替える） */
    setFullscreen(active: boolean) {
      if (!state.fullscreen.available || state.fullscreen.active === active) return
      void app
        .requestDisplayMode({ mode: active ? 'fullscreen' : 'inline' })
        .then(({ mode }) => update({ fullscreen: { ...state.fullscreen, active: mode === 'fullscreen' } }))
        .catch(() => {})
    },
    /** 利用者が View で見ている対象を AI に伝え、続けてチャットで聞かれたときに指せるようにする */
    tellModel(text: string) {
      if (disposed) return
      void app.updateModelContext({ content: [{ type: 'text', text }] }).catch(() => {})
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
