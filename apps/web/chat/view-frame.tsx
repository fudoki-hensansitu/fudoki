// MCP Apps の View（apps/api の ui/）を sandbox の iframe に置き、AppBridge で tool の入力と結果を渡す。
// iframe は srcdoc + sandbox="allow-scripts"（同じオリジンを与えない）で、View の CSP は resource の _meta.ui.csp から作る。
// 試作の土台は apps/api/tests/host.ts
import * as React from 'react'
import { createPortal } from 'react-dom'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { McpUiDisplayMode, McpUiStyles } from '@modelcontextprotocol/ext-apps'
import { GripHorizontalIcon, PanelRightOpenIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
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
// 右のパネルに置いた View のタブ。iframe は動かさず（動かすと View が読み直しになる）、選ばれていないものは隠すだけにする
interface Tab {
  owner: object
  title: string
  /** 会話の元の場所へ戻す */
  close: () => void
}
interface Panel {
  tabs: Tab[]
  active?: object
}
let panel: Panel = { tabs: [] }
let panelMargin = ''
const panelListeners = new Set<() => void>()
const setPanel = (next: Panel) => {
  // 開いている間は、会話を左半分に寄せる。最初のタブで元の margin を覚え、最後のタブが閉じたときに戻す
  if (!panel.tabs.length && next.tabs.length) panelMargin = document.body.style.marginRight
  if (next.tabs.length) document.body.style.marginRight = '50vw'
  else if (panel.tabs.length) document.body.style.marginRight = panelMargin
  panel = next
  panelListeners.forEach((l) => l())
}
const subscribePanel = (l: () => void) => {
  panelListeners.add(l)
  return () => void panelListeners.delete(l)
}
const getPanel = () => panel
function openTab(tab: Tab) {
  setPanel({ tabs: [...panel.tabs.filter((t) => t.owner !== tab.owner), tab], active: tab.owner })
}
/** タブを閉じたあと、残ったタブ（選ばれている側）へ focus を移す。閉じた × や tab は DOM から外れるので、そのままだと focus が頁の先頭へ落ちる */
function closeAndFocus(tab: Tab) {
  tab.close()
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (panel.active) document.getElementById(`view-tab-${panelKey(panel.active)}`)?.focus()
    }),
  )
}
function closeTab(owner: object) {
  const tabs = panel.tabs.filter((t) => t.owner !== owner)
  if (tabs.length === panel.tabs.length) return
  setPanel({ tabs, active: panel.active === owner ? tabs.at(-1)?.owner : panel.active })
}
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

const panelKeys = new WeakMap<object, number>()
let panelKeyCount = 0
const panelKey = (owner: object) => {
  if (!panelKeys.has(owner)) panelKeys.set(owner, ++panelKeyCount)
  return panelKeys.get(owner)
}

/** タブの名前。結果の中の見出しになるものを使う */
function titleOf(output: unknown) {
  const data = (output as { structuredContent?: { node?: { name?: string }; nodes?: { name?: string; kou_name?: string | null; kan_name?: string }[] } })?.structuredContent
  const first = data?.nodes?.[0]
  return data?.node?.name ?? first?.kou_name ?? first?.kan_name ?? first?.name ?? '表とグラフ'
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

  // 全画面と右のパネルは popover で top layer に上げる。固定のヘッダーや入力欄（z-20）の上に出し、祖先の stacking context に左右されないようにする。iframe は DOM の中で動かさない（動かすと View が読み直しになる）
  const box = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if ((fullscreen || side) && el && !el.matches(':popover-open')) el.showPopover()
  }, [fullscreen, side])

  // 右のパネルにタブとして置く。タブを閉じる・元に戻すと、会話の元の場所へ戻る
  const tabState = React.useSyncExternalStore(subscribePanel, getPanel)
  const title = React.useMemo(() => titleOf(output), [output])
  React.useEffect(() => {
    if (!side) return
    const owner = me.current
    openTab({ owner, title, close: () => setMode('inline') })
    return () => closeTab(owner)
  }, [side, title])
  const activeTab = side && tabState.active === me.current

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
      if (e.key === 'Escape' && (fullscreen || panel.active === me.current)) setMode('inline')
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
      // popover の属性は全画面・右のパネルの間だけ付ける（付けたまま閉じると display: none になる）
      popover={fullscreen || side ? 'manual' : undefined}
      role={fullscreen ? 'dialog' : side ? 'tabpanel' : undefined}
      id={side ? `view-panel-${panelKey(me.current)}` : undefined}
      aria-labelledby={side ? `view-tab-${panelKey(me.current)}` : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? '風土記の表とグラフ（全画面）' : undefined}
      className={
        fullscreen
          ? 'fixed inset-0 m-0 flex size-full max-h-none max-w-none flex-col border-0 bg-background p-0 text-foreground'
          : side
            ? cn('fixed inset-y-0 right-0 left-auto m-0 h-auto max-h-none w-1/2 flex-col border-0 border-l bg-background p-0 text-foreground', activeTab ? 'flex' : 'hidden')
            : 'group/view relative w-full overflow-hidden rounded-xl border bg-background'
      }
    >
      {fullscreen ? (
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-sm text-muted-foreground">風土記の表とグラフ</span>
          <Button ref={close} variant="ghost" size="icon-sm" aria-label="元の大きさに戻す（Esc）" title="元の大きさに戻す（Esc）" onClick={() => setMode('inline')}>
            <XIcon />
          </Button>
        </div>
      ) : null}
      {activeTab ? (
        // タブの帯は選ばれている View の箱にだけ描く（隠れている箱には描かない）。tablist の中は tab だけ（閉じる × は各タブの中。キーボードでは、選ばれているタブで Esc か Delete）
        <div className="flex shrink-0 items-end border-b px-2 pt-2">
          <div
            role="tablist"
            aria-label="右のパネルの表とグラフ"
            className="flex min-w-0 items-end gap-1 overflow-x-auto"
            onKeyDown={(e) => {
              const i = tabState.tabs.findIndex((t) => t.owner === tabState.active)
              // タブの Delete で、選ばれているタブを閉じる（tabs パターンの任意のキー）
              if (e.key === 'Delete' && tabState.tabs[i]) {
                e.preventDefault()
                closeAndFocus(tabState.tabs[i])
                return
              }
              const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabState.tabs.length - 1 }[e.key]
              if (next === undefined) return
              e.preventDefault()
              const target = tabState.tabs[(next + tabState.tabs.length) % tabState.tabs.length]
              if (!target) return
              setPanel({ ...panel, active: target.owner })
              // 選ばれた View の箱に帯が描き直されてから、その tab に focus を移す
              requestAnimationFrame(() => document.getElementById(`view-tab-${panelKey(target.owner)}`)?.focus())
            }}
          >
            {tabState.tabs.map((t, i) => {
              // 同じ名前のタブは、2つ目からは番号を添えて見分ける
              const same = tabState.tabs.slice(0, i).filter((o) => o.title === t.title).length
              const key = panelKey(t.owner)
              const selected = t.owner === tabState.active
              const label = same ? `${t.title}（${same + 1}）` : t.title
              return (
                // 閉じる × は各タブの中（名前の右）に置く。tab の中に button を入れない（入れ子にしない）ので、枠は外側の div が持つ
                <div
                  key={key}
                  role="presentation"
                  className={cn('flex max-w-56 shrink-0 items-center rounded-t-md border border-b-0 text-sm', selected ? 'bg-background text-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground')}
                >
                  <button
                    id={`view-tab-${key}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`view-panel-${key}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      setPanel({ ...panel, active: t.owner })
                      requestAnimationFrame(() => document.getElementById(`view-tab-${key}`)?.focus())
                    }}
                    className="min-w-0 truncate py-1.5 pr-1 pl-3"
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`「${label}」を閉じて会話の中へ元に戻す`}
                    title={selected ? '閉じて会話の中へ元に戻す（Esc、タブで Delete）' : '閉じて会話の中へ元に戻す'}
                    onClick={() => closeAndFocus(t)}
                    className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-muted-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {grippable ? (
        // 常には出さず、View にホバー（またはキーボードの focus）したときだけ、上辺の真ん中に出す。掴んで右へ離すと右パネルに開く。
        // iframe の上のホバーが親に届かない場合に備え、上辺の真ん中は親側の領域（group/zone）でも出す
        <div className="group/zone absolute top-0 left-1/2 z-10 h-6 w-16 -translate-x-1/2">
          <button
            type="button"
            onPointerDown={startDrag}
            onClick={() => {
              // 押しただけ（キーボードの Enter も含む）で右に開く。ドラッグしたあとの click は無視する
              if (!dragged.current) setMode('fullscreen')
              dragged.current = false
            }}
            className={cn(
              'absolute top-0.5 left-1/2 flex h-5 w-12 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm backdrop-blur select-none',
              'pointer-events-none opacity-0 group-focus-within/view:pointer-events-auto group-focus-within/view:opacity-100 group-hover/view:pointer-events-auto group-hover/zone:pointer-events-auto group-hover/view:opacity-100 group-hover/zone:opacity-100 focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-150',
              'hover:text-foreground active:cursor-grabbing',
            )}
            aria-label="右のパネルに開く（右へドラッグ、または Enter）"
            title="右へドラッグすると、会話の横に開きます"
          >
            <GripHorizontalIcon className="size-4" />
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
    {drag ? createPortal(
      <div
        ref={(el) => { if (el && !el.matches(':popover-open')) el.showPopover() }}
        popover="manual"
        aria-hidden
        className={`pointer-events-none fixed inset-y-0 right-0 left-auto m-0 flex h-auto w-1/2 items-center justify-center overflow-visible border-0 border-l-2 border-dashed p-0 text-sm transition-colors ${drag.over ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/60 text-muted-foreground'}`}>
        ここに置くと右に開きます
      </div>,
      document.body,
    ) : null}
    </>
  )
}
