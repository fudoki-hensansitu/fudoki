// MCP Apps の View（apps/api の ui/）を sandbox の iframe に置き、AppBridge で tool の入力と結果を渡す。
// iframe は srcdoc + sandbox="allow-scripts"（同じオリジンを与えない）で、View の CSP は resource の _meta.ui.csp から作る。
// 試作の土台は apps/api/tests/host.ts
import * as React from 'react'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { McpUiDisplayMode, McpUiStyles } from '@modelcontextprotocol/ext-apps'
import { XIcon } from 'lucide-react'
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

const WIDE = '(min-width: 768px)'
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
  onMessage,
  onContext,
}: {
  token: string
  uri: string
  /** 描画 tool の入力（{ tool, arguments }） */
  input: unknown
  /** 描画 tool の結果（structuredContent と _meta を含む CallToolResult） */
  output: unknown
  /** View が「チャットで聞く」を押したとき */
  onMessage: (text: string) => void
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
  const fullscreen = expanded && !wide
  const bridgeRef = React.useRef<AppBridge>(undefined)
  const modeRef = React.useRef(mode)
  modeRef.current = mode
  const close = React.useRef<HTMLButtonElement>(null)
  // 親の再描画で bridge を作り直さないよう、最新の callback を ref で持つ
  const handlers = React.useRef({ onMessage, onContext })
  handlers.current = { onMessage, onContext }

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
          { openLinks: {}, serverTools: {}, logging: {}, updateModelContext: { text: {} }, message: { text: {} } },
          { hostContext: hostContext(modeRef.current) },
        )
        bridgeRef.current = bridge
        bridge.oncalltool = async (params) => (await relay(token, 'tools/call', { name: params.name, arguments: params.arguments ?? {} })) as never
        bridge.onopenlink = async ({ url }) => {
          // 原典の PDF などの外部の頁は新しいタブで開き、こちらの頁を触らせない
          if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
          return {}
        }
        bridge.onmessage = async ({ content }) => {
          const text = content.map((c) => ('text' in c ? c.text : '')).join('').trim()
          if (text) handlers.current.onMessage(text)
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
    const margin = document.body.style.marginRight
    document.body.style.marginRight = '50vw'
    return () => {
      document.body.style.marginRight = margin
    }
  }, [side])

  // 大きさが変わったら host context で View に伝える（View は displayMode に合わせて表示の密度を変える）
  React.useEffect(() => {
    bridgeRef.current?.setHostContext(hostContext(mode))
    if (!expanded) return
    // 重ねている間は下の会話を動かさない。iframe の中で押した Esc は頁に届かないので、閉じるボタンに focus を置く
    const overflow = document.body.style.overflow
    if (fullscreen) document.body.style.overflow = 'hidden'
    if (fullscreen) close.current?.focus()
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
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> 表を準備しています
        </div>
      ) : null}
      <iframe ref={frame} title="風土記の表とグラフ" sandbox="allow-scripts" className={expanded ? 'block min-h-0 w-full flex-1 border-0' : 'block w-full border-0'} style={expanded ? undefined : { height }} />
    </div>
    {!expanded && ready ? (
      <button type="button" onClick={() => setMode('fullscreen')} className="mt-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
        大きく開く
      </button>
    ) : null}
    </>
  )
}
