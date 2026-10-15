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
  /** 押した行。取得を待つ間も、移った先の見出しを先に出す */
  pending?: TreeNode
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
      // body は iframe の高さまで伸ばしているので、中身の #root を測る
      const height = Math.ceil((document.getElementById('root') ?? document.body).getBoundingClientRect().height)
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
    // 描画 tool（render_expenditure_view）の入力は { tool, arguments }。データ tool の入力は arguments の中にある
    const input = (params.arguments ?? {}) as Json
    args = (input.arguments && typeof input.arguments === 'object' ? input.arguments : input) as Json
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
          observer.observe(document.getElementById('root') ?? document.body)
          window.addEventListener('resize', resize)
          resize()
        })
        .catch((error) => {
          update({ busy: false, error: `接続に失敗しました: ${String(error)}` })
        })),
    /** drill は今の画面を履歴に積み、reset は履歴を捨てて移る（経路の根の会計へ移るとき）、append は続きを足す */
    async call(tool: string, input: Json, mode: 'drill' | 'append' | 'reset', pending?: TreeNode) {
      if (disposed || state.busy || !state.entry) return
      const previous = state.entry
      const id = ++epoch
      request = new AbortController()
      update({ busy: true, error: undefined, pending })
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
          history: mode === 'drill' ? [...state.history, previous] : mode === 'reset' ? [] : state.history,
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
          update({ busy: false, pending: undefined })
        }
      }
    },
    /**
     * 経路の款・項へ移る。同じ団体・年度・資料・会計の中から名前でその段を検索し、見つかった明細を開く。
     * 親の ID を持たない明細（検索結果から開いたものなど）でも、どの段にも移れるようにする。
     * 移った先より深い明細の履歴は経路と食い違うので捨てる。
     */
    async openLevel(from: TreeNode, kind: '款' | '項') {
      if (disposed || state.busy || !state.entry) return
      const id = ++epoch
      request = new AbortController()
      update({ busy: true, error: undefined })
      const fetchTool = async (name: string, args: Json) => {
        const result = await app.callServerTool({ name, arguments: args }, { signal: request!.signal })
        const data = result.structuredContent as Json | undefined
        if (result.isError || !data || toolFor(data) !== name) throw new Error(result.isError ? message(result) : '表示できない結果です')
        return { data: data as ViewData, meta: result._meta }
      }
      try {
        const found = await fetchTool('search_expenditure_nodes', {
          document_kind: from.document_kind,
          fiscal_year: { min: from.fiscal_year, max: from.fiscal_year },
          where: {
            jurisdiction_code: { eq: [from.jurisdiction_code] },
            account_name: { eq: [from.account_name] },
            node_kind: { eq: [kind] },
            kan_name: { eq: [from.kan_name] },
            ...(kind === '項' && from.kou_name ? { kou_name: { eq: [from.kou_name] } } : {}),
          },
          page_size: 1,
        })
        if (disposed || id !== epoch) return
        const target = 'nodes' in found.data ? found.data.nodes[0] : undefined
        if (!target) throw new Error(`${kind === '款' ? from.kan_name : from.kou_name}が見つかりませんでした`)
        const args = { document_kind: target.document_kind, node_id: target.node_id }
        const opened = await fetchTool('get_expenditure_node', args)
        if (disposed || id !== epoch) return
        update({
          entry: { tool: 'get_expenditure_node', args, data: opened.data, revision: id },
          // 明細の履歴は別の枝なので捨て、来た一覧には経路の会計から戻れるように残す
          history: state.history.filter((e) => !('node' in e.data)),
          names: { ...state.names, ...namesOf(opened.meta) },
        })
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
    /**
     * チャットに利用者のメッセージを送り、AI に tool を呼び直させる。View の中で画面を移すのではなく、
     * 新しい問いとして会話に残し、AI が結果を受け取って続きを答えられるようにする。
     */
    ask(text: string) {
      // 送っている間は busy にして、連打で同じ問いを重ねて送らない
      if (disposed || state.busy) return
      update({ busy: true, error: undefined })
      void app
        .sendMessage({ role: 'user', content: [{ type: 'text', text }] })
        .then((result) => { if (result.isError) update({ error: 'チャットに送れませんでした' }) })
        .catch((error) => update({ error: `チャットに送れませんでした: ${String(error)}` }))
        .finally(() => { if (!disposed) update({ busy: false }) })
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
