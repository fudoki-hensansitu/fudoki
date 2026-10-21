// MCP Apps の View（apps/api の ui/）を sandbox の iframe に置き、AppBridge で tool の入力と結果を渡す。
// iframe は srcdoc + sandbox="allow-scripts"（同じオリジンを与えない）で、View の CSP は resource の _meta.ui.csp から作る。
// 試作の土台は apps/api/tests/host.ts
import * as React from 'react'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { McpUiDisplayMode, McpUiStyles } from '@modelcontextprotocol/ext-apps'
import { GripVerticalIcon, PanelRightOpenIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { relay } from './relay'

interface Resource {
  html: string
  connectDomains: string[]
}
const resources = new Map<string, Promise<Resource>>()

/** 同じ URI の View は中身が変わらない（apps/api が URI に中身のハッシュを入れる）ので、頁の中で1回だけ読む */
function loadResource(token: string, uri: string) {
  let found = resources.get(uri)
  if (!found) {
    found = relay(token, 'resources/read', { uri }).then((result) => {
      const content = (result as { contents?: { uri: string; text?: string; _meta?: { ui?: { csp?: { connectDomains?: string[] } } } }[] }).contents?.find((c) => c.uri === uri)
      if (!content?.text) throw new Error('画面を読み込めませんでした')
      // 接続先は https の origin だけを通す（CSP に任意の文字列を入れさせない）
      const connectDomains = (content._meta?.ui?.csp?.connectDomains ?? []).filter((d) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(d))
      return { html: content.text, connectDomains }
    })
    found.catch(() => resources.delete(uri))
    resources.set(uri, found)
  }
  return found
}

/** Tailwind の md と同じ幅。横に開く側の panel の幅（w-1/2）と本文の寄せ（50vw）も合わせる */
const WIDE = '(min-width: 768px)'
// 横に開いている View の数と、開く前の body の margin（複数あっても最後に閉じたときに戻す）
let sideOpen = 0
let sideMargin = ''
// 右のパネルは1枠。別の View が入ると、前の View は会話の中へ戻る
let panel: { owner: object; release: () => void } | undefined
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches

/** View に選ばせる表示の大きさ。広い画面では会話の右に並べ（side-by-side）、狭い画面では頁の上に全画面で重ねる */
type DisplayMode = Extract<McpUiDisplayMode, 'inline' | 'fullscreen'>
const DISPLAY_MODES: DisplayMode[] = ['inline', 'fullscreen']

/** 頁の token を View に渡し、View の背景・文字・枠・字を会話の画面に合わせる。setHostContext は全体を置き換えるので、毎回すべてを作る */
function hostContext(displayMode: DisplayMode) {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    theme: dark() ? ('dark' as const) : ('light' as const),
    displayMode,
    availableDisplayModes: DISPLAY_MODES,
    locale: 'ja-JP',
    styles: {
      variables: {
        '--color-background-primary': v('--background'),
        '--color-background-secondary': v('--secondary'),
        '--color-text-primary': v('--foreground'),
        '--color-text-secondary': v('--muted-foreground'),
        '--color-border-primary': v('--border'),
        '--font-sans': v('--font-sans'),
        '--border-radius-md': v('--radius'),
      } as McpUiStyles,
    },
  }
}

export function ViewFrame({
  token,
  uri,
  input,
  output,
  onContext,
}: {
  token: string
  uri: string
  /** 描画 tool の入力（{ tool, arguments }） */
  input: unknown
  /** 描画 tool の結果（structuredContent と _meta を含む CallToolResult） */
  output: unknown
  /** View が「いま見ているもの」を AI に伝えるとき */
  onContext: (text: string) => void
}) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = React.useState(360)
  const [error, setError] = React.useState<string>()
  const [ready, setReady] = React.useState(false)
  const [mode, setMode] = React.useState<DisplayMode>('inline')
  const expanded = mode === 'fullscreen'
  // 広い画面では会話を残したまま右半分に開く。狭い画面だけ全画面にする
  const [wide, setWide] = React.useState(() => matchMedia(WIDE).matches)
  React.useEffect(() => {
    const media = matchMedia(WIDE)
    const onChange = () => setWide(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  const side = expanded && wide
  const me = React.useRef({})
  const fullscreen = expanded && !wide
  // 取っ手を掴んでいる間だけ、右半分に置き場を出す。iframe の上では pointer が奪われるので、掴む場所は View の外に置く
  const [drag, setDrag] = React.useState<{ over: boolean }>()
  const dragged = React.useRef(false)
  // 掴んでいる間の後始末。取っ手が消えたとき・中断されたとき・unmount でも必ず呼んで、置き場と iframe を元へ戻す
  const stopDrag = React.useRef<() => void>(undefined)
  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    stopDrag.current?.()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startX = e.clientX
    let moved = false
    dragged.current = false
    const over = (x: number) => x > window.innerWidth / 2
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 4) moved = dragged.current = true
      if (moved) setDrag({ over: over(ev.clientX) })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      stopDrag.current = undefined
      setDrag(undefined)
    }
    // 中断したときは click が来ないので、掴んだ印もここで戻す
    const cancel = () => {
      cleanup()
      dragged.current = false
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      if (moved && over(ev.clientX)) setMode('fullscreen')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    stopDrag.current = cancel
  }
  const grippable = !expanded && wide && ready
  React.useEffect(() => {
    if (!grippable) stopDrag.current?.()
  }, [grippable])
  React.useEffect(() => () => stopDrag.current?.(), [])
  const bridgeRef = React.useRef<AppBridge>(undefined)
  const modeRef = React.useRef(mode)
  modeRef.current = mode
  const close = React.useRef<HTMLButtonElement>(null)
  // 親の再描画で bridge を作り直さないよう、最新の callback を ref で持つ
  const handlers = React.useRef({ onContext })
  handlers.current = { onContext }

  React.useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    let bridge: AppBridge | undefined
    let disposed = false
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onTheme = () => bridge?.setHostContext(hostContext(modeRef.current))
    loadResource(token, uri)
      .then((resource) => {
        if (disposed) return
        bridge = new AppBridge(
          null,
          { name: '風土記', version: '1.0.0' },
          { openLinks: {}, serverTools: {}, logging: {}, updateModelContext: { text: {} } },
          { hostContext: hostContext(modeRef.current) },
        )
        bridgeRef.current = bridge
        bridge.oncalltool = async (params) => (await relay(token, 'tools/call', { name: params.name, arguments: params.arguments ?? {} })) as never
        bridge.onopenlink = async ({ url }) => {
          // 出典の PDF などの外部の頁は新しいタブで開き、こちらの頁を触らせない
          if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
          return {}
        }
        bridge.onupdatemodelcontext = async ({ content }) => {
          handlers.current.onContext(content?.map((c) => ('text' in c ? c.text : '')).join('') ?? '')
          return {}
        }
        // View が「全画面で開く」「元の大きさに戻す」を頼んだとき。知らない大きさ（pip など）はいまのままにする
        bridge.onrequestdisplaymode = async ({ mode }) => {
          const next = DISPLAY_MODES.includes(mode as DisplayMode) ? (mode as DisplayMode) : modeRef.current
          setMode(next)
          return { mode: next }
        }
        bridge.onsizechange = ({ height }) => {
          if (typeof height === 'number' && height > 0) setHeight(Math.min(Math.ceil(height), 4000))
        }
        bridge.oninitialized = async () => {
          setReady(true)
          await bridge!.sendToolInput({ arguments: (input ?? {}) as Record<string, unknown> })
          await bridge!.sendToolResult(output as never)
        }
        const connected = bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
        const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src ${resource.connectDomains.join(' ') || "'none'"}; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`
        iframe.srcdoc = resource.html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
        media.addEventListener('change', onTheme)
        return connected
      })
      .catch((e: unknown) => {
        if (!disposed) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      disposed = true
      bridgeRef.current = undefined
      media.removeEventListener('change', onTheme)
      void bridge?.teardownResource({}).catch(() => {})
      void bridge?.close().catch(() => {})
    }
    // 1つの tool 結果に1つの iframe。入力と結果は変わらない
  }, [token, uri])

  // 全画面は popover で top layer に上げる。会話の一覧は contain と content-visibility で fixed の基準を閉じ込めるので、
  // position: fixed だけでは画面全体を覆えない。iframe は DOM の中で動かさない（動かすと View が読み直しになる）
  const box = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if (fullscreen && el && !el.matches(':popover-open')) el.showPopover()
  }, [fullscreen])

  // 横に開く間は、会話を左半分に寄せる
  React.useEffect(() => {
    if (!side) return
    const owner = me.current
    if (panel && panel.owner !== owner) panel.release()
    panel = { owner, release: () => setMode('inline') }
    if (sideOpen++ === 0) sideMargin = document.body.style.marginRight
    document.body.style.marginRight = '50vw'
    return () => {
      if (panel?.owner === owner) panel = undefined
      // 複数の View が横に開いていても、最後の1つが閉じたときに元へ戻す
      if (--sideOpen === 0) document.body.style.marginRight = sideMargin
    }
  }, [side])

  // 大きさが変わったら host context で View に伝える（View は displayMode に合わせて表示の密度を変える）
  React.useEffect(() => {
    bridgeRef.current?.setHostContext(hostContext(mode))
    if (!expanded) return
    // 重ねている間は下の会話を動かさない。iframe の中で押した Esc は頁に届かないので、閉じるボタンに focus を置く
    const overflow = document.body.style.overflow
    if (fullscreen) {
      document.body.style.overflow = 'hidden'
      close.current?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('inline')
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, fullscreen])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  return (
    <>
    <div
      ref={box}
      // popover の属性は全画面の間だけ付ける（付けたまま閉じると display: none になる）
      popover={fullscreen ? 'manual' : undefined}
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? '風土記の表とグラフ（全画面）' : side ? '風土記の表とグラフ' : undefined}
      className={
        fullscreen
          ? 'fixed inset-0 m-0 flex size-full max-h-none max-w-none flex-col border-0 bg-background p-0 text-foreground'
          : side
            ? 'fixed inset-y-0 right-0 z-40 flex w-1/2 flex-col border-l bg-background text-foreground'
            : 'relative w-full overflow-hidden rounded-xl border bg-background'
      }
    >
      {expanded ? (
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-sm text-muted-foreground">風土記の表とグラフ</span>
          <Button ref={close} variant="ghost" size="icon-sm" aria-label="元の大きさに戻す（Esc）" title="元の大きさに戻す（Esc）" onClick={() => setMode('inline')}>
            <XIcon />
          </Button>
        </div>
      ) : null}
      {grippable ? (
        <div className="flex items-center border-b px-2 py-1">
          <button
            type="button"
            onPointerDown={startDrag}
            onClick={(e) => {
              // 押しただけ（キーボードの Enter も含む）で右に開く。ドラッグしたあとの click は無視する
              if (!dragged.current) setMode('fullscreen')
              dragged.current = false
            }}
            className="flex cursor-grab touch-none items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground select-none hover:bg-secondary hover:text-foreground active:cursor-grabbing"
            title="右にドラッグして、会話の横に並べる（クリックでも開きます）"
          >
            <GripVerticalIcon className="size-3.5" />
            右に並べる
          </button>
        </div>
      ) : null}
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> 表を準備しています
        </div>
      ) : null}
      <iframe ref={frame} title="風土記の表とグラフ" sandbox="allow-scripts" className={`${expanded ? 'block min-h-0 w-full flex-1 border-0' : 'block w-full border-0'}${drag ? ' pointer-events-none' : ''}`} style={expanded ? undefined : { height }} />
    </div>
    {side ? (
      // 右のパネルへ移した View の元の場所。急に消えたように見えないよう、ここで開いている場所を示す
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><PanelRightOpenIcon className="size-4" />右のパネルで開いています</span>
        <Button variant="outline" size="sm" onClick={() => setMode('inline')}>元に戻す</Button>
      </div>
    ) : null}
    {!expanded && !wide && ready ? (
      <button type="button" onClick={() => setMode('fullscreen')} className="mt-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
        大きく開く
      </button>
    ) : null}
    {drag ? (
      <div aria-hidden className={`pointer-events-none fixed inset-y-0 right-0 z-50 flex w-1/2 items-center justify-center border-l-2 border-dashed text-sm transition-colors ${drag.over ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/60 text-muted-foreground'}`}>
        ここに置くと右に開きます
      </div>
    ) : null}
    </>
  )
}
