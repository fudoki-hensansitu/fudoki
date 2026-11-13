// 会話の本体。履歴はブラウザだけが持ち、送るたびに web の Worker（/api/chat）へ渡す。
// 会話の画面（/s/:id）は頁全体を、自治体の個別ページは下から出す drawer の中を、scroller としてスクロールする。
// AI が描画 tool を呼んだ結果は、apps/api の MCP Apps の View を iframe に置いて見せる（独自の表は作らない）
import * as React from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type DynamicToolUIPart, type UIMessage } from 'ai'
import { CheckIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { readSuggestions } from '../../../packages/fiscal/suggestions'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { Composer } from './composer'
import { forServer, MAX_CONTEXT, splitContext } from './history'
import { Markdown } from './markdown'
import { saveSession, type StoredSession } from './store'
import { ViewFrame } from './view-frame'

/** 頁の端からこの距離以内なら、その側のフェードは出さない */
const FADE_EDGE_PX = 4
/** 一番下からこの距離以内なら、読み終えて追っていると見なす */
const NEAR_BOTTOM_PX = 120

type Metadata = { apps?: Record<string, string>; context?: string }
type ChatMessage = UIMessage<Metadata>

const TOOL_LABELS: Record<string, string> = {
  search_expenditure_subjects: '支出を検索',
  search_expenditure_details: '内訳を検索',
  get_expenditure_line: '科目・内訳を開く',
  list_jurisdictions: '収録している自治体を確認',
  get_evaluation: '事業評価を開く',
  get_evaluation_sheet: '評価シートを開く',
  search_evaluation_sheets: '評価シートを検索',
  get_budget_proposal: '予算案の発表を開く',
  search_budget_measures: '予算案の施策を検索',
  get_project: '事業を開く',
  search_projects: '事業を検索',
  render_expenditure_view: '表とグラフを用意',
  read_source_page: '資料を読む',
}

function ToolMarker({ part }: { part: DynamicToolUIPart }) {
  const label = TOOL_LABELS[part.toolName] ?? part.toolName
  const failed = part.state === 'output-error' || (part.state === 'output-available' && (part.output as { isError?: boolean })?.isError)
  const done = part.state === 'output-available' && !failed
  return (
    <Marker>
      <MarkerIcon>{failed ? <WarningCircleIcon /> : done ? <CheckIcon /> : <Spinner />}</MarkerIcon>
      <MarkerContent className={done || failed ? undefined : 'shimmer'}>{failed ? `${label}に失敗しました` : label}</MarkerContent>
    </Marker>
  )
}

/** 最後の応答の tool の結果に付いた、次の質問の候補（結果の _meta）。複数の tool があれば後のものを使う */
function suggestionsOf(m: ChatMessage | undefined) {
  if (m?.role !== 'assistant') return []
  for (const p of m.parts.toReversed()) {
    if (p.type !== 'dynamic-tool' || p.state !== 'output-available') continue
    const found = readSuggestions((p.output as { _meta?: unknown } | undefined)?._meta)
    if (found.length > 0) return found
  }
  return []
}

export function Conversation({
  id,
  stored,
  header,
  scroller,
  autoFocus = true,
  context,
  beforeComposer,
  onSend,
  movableViews = false,
}: {
  id: string
  stored: StoredSession
  /** 上に固定する見出し（ロゴや閉じるボタン） */
  header: React.ReactNode
  /** 会話をスクロールする箱。無ければ頁全体 */
  scroller?: React.RefObject<HTMLElement | null>
  autoFocus?: boolean
  /** 送るたびに読む、頁で見ているもの（自治体の頁の画面・選んだ文）。表とグラフの View が渡す文脈の前に足す */
  context?: () => string | undefined
  /** 続けて聞く入力欄の上に出すもの（選んだ文など） */
  beforeComposer?: React.ReactNode
  /** 続けて聞いたとき（選んだ文を外すなど） */
  onSend?: () => void
  /** 表とグラフを会話の横のパネルへ移せるか。会話の頁だけ。自治体の頁のように会話がパネルの中にあるときは移さない */
  movableViews?: boolean
}) {
  const viewContext = React.useRef(stored.viewContext ?? '')
  // 頁の文脈は質問ごとに読み、その発言の metadata に持たせる（server が選んだ文は質問の直前の利用者の発言に、見ている画面は最後の質問のものだけを system prompt に入れる）
  const contextRef = React.useRef(context)
  contextRef.current = context
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        headers: { Authorization: `Bearer ${stored.token}` },
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { id, messages: forServer(messages), ...(stored.entry ? { entry: stored.entry } : {}), ...(viewContext.current ? { viewContext: viewContext.current } : {}) },
        }),
      }),
    [id, stored.token],
  )
  const { messages, sendMessage, status, stop, error } = useChat<ChatMessage>({
    id,
    messages: (stored.messages ?? []) as ChatMessage[],
    transport,
    onFinish: ({ messages }) => {
      return saveSession(id, { token: stored.token, expiresAt: stored.expiresAt, messages, ...(stored.entry ? { entry: stored.entry } : {}), ...(viewContext.current ? { viewContext: viewContext.current } : {}) })
    },
  })
  const busy = status === 'submitted' || status === 'streaming'
  const onSendRef = React.useRef(onSend)
  onSendRef.current = onSend
  const send = React.useCallback((text: string, pageContext = contextRef.current?.()) => {
    const ctx = pageContext?.slice(0, MAX_CONTEXT)
    void sendMessage({ text, ...(ctx ? { metadata: { context: ctx } } : {}) })
    onSendRef.current?.()
  }, [sendMessage])
  // 入口で入力した最初の質問を1回だけ送る（StrictMode の二重実行でも1回）
  const sent = React.useRef(false)
  React.useEffect(() => {
    if (sent.current || !stored.pending) return
    sent.current = true
    saveSession(id, { token: stored.token, expiresAt: stored.expiresAt, messages: stored.messages, ...(stored.entry ? { entry: stored.entry } : {}), ...(stored.viewContext ? { viewContext: stored.viewContext } : {}) })
    // 入口で書いた最初の質問は、書いたときの文脈（選んだ文を含む）で送る
    send(stored.pending, stored.pendingContext)
  }, [id, stored, send])

  // 一番下を読んでいる間は、送ったときも配信中も画面全体を最下部へ追う。利用者が上へ遡ったら追わない
  // 上下のフェード（scroll-fade と同じ見え方）は、頁の端にいる側では出さない
  const pinned = React.useRef(true)
  const [fade, setFade] = React.useState({ top: false, bottom: false })
  const box = React.useCallback(() => {
    const el = scroller?.current
    return el
      ? { top: el.scrollTop, height: el.scrollHeight, view: el.clientHeight, target: el as HTMLElement | Window }
      : { top: window.scrollY, height: document.documentElement.scrollHeight, view: window.innerHeight, target: window as HTMLElement | Window }
  }, [scroller])
  const measure = React.useCallback(() => {
    const b = box()
    const rest = b.height - b.top - b.view
    pinned.current = rest < NEAR_BOTTOM_PX
    const top = b.top > FADE_EDGE_PX
    const bottom = rest > FADE_EDGE_PX
    setFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }))
  }, [box])
  React.useEffect(() => {
    const target = box().target
    target.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      target.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure, box])
  // ソフトキーボードは iOS・Android（既定）でレイアウトの高さを縮めず、下に固定した入力欄が裏に隠れる。見えている範囲の下端へ持ち上げる
  React.useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const lift = () => root.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`)
    lift()
    vv.addEventListener('resize', lift)
    vv.addEventListener('scroll', lift)
    return () => {
      vv.removeEventListener('resize', lift)
      vv.removeEventListener('scroll', lift)
      root.style.removeProperty('--kb')
    }
  }, [])
  React.useEffect(() => {
    if (status === 'submitted') pinned.current = true
    if (pinned.current) box().target.scrollTo({ top: box().height })
    measure()
  }, [messages, status, measure, box])

  const suggestions = busy ? [] : suggestionsOf(messages.at(-1))
  // 応答の生成中で、画面に動くものが無い間は「考えています」を出す。止まって見えないように。
  // 出すのは送った直後と、tool の結果が返ったあと次を組み立てている間だけ。文が出始めたあとは出さない（書き終えた答えの下に出ないように）
  const last = messages.at(-1)?.parts.at(-1)
  const thinking =
    status === 'submitted' ||
    (status === 'streaming' &&
      (last === undefined || last.type === 'step-start' || (last.type === 'dynamic-tool' && (last.state === 'output-available' || last.state === 'output-error'))))
  const apps = (m: ChatMessage) => m.metadata?.apps ?? {}
  return (
    <div className={`flex w-full flex-col ${scroller ? 'min-h-full' : 'min-h-dvh'}`}>
      <div className="sticky top-0 z-20 bg-background">
      {header}
      <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-full h-10 bg-gradient-to-b from-background to-transparent transition-opacity duration-200 ${fade.top ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        <div className="flex flex-1 flex-col gap-4 pb-6">
          {messages.map((m) => (
            <div key={m.id}>
              {m.role === 'user' && m.metadata?.context ? <ContextNote text={m.metadata.context} /> : null}
              <Message align={m.role === 'user' ? 'end' : 'start'}>
                <MessageContent>
                  {m.parts.map((p, i) => {
                    if (p.type === 'text' && p.text.trim())
                      return (
                        <Bubble key={i} variant={m.role === 'user' ? 'secondary' : 'ghost'} align={m.role === 'user' ? 'end' : 'start'}>
                          <BubbleContent className={m.role === 'user' ? 'whitespace-pre-wrap' : undefined}>{m.role === 'user' ? p.text : <Markdown text={p.text} />}</BubbleContent>
                        </Bubble>
                      )
                    if (p.type !== 'dynamic-tool') return null
                    const uri = apps(m)[p.toolName]
                    const output = p.state === 'output-available' ? (p.output as { isError?: boolean; structuredContent?: unknown }) : undefined
                    // View は結果の structuredContent を描く。履歴から復元した結果で structuredContent が無いときは印だけにする
                    if (uri && output && !output.isError && output.structuredContent)
                      return (
                        <ViewFrame key={i} token={stored.token} uri={uri} movable={movableViews} input={p.input} output={output} onContext={(text) => (viewContext.current = text.slice(0, 2000))} />
                      )
                    return <ToolMarker key={i} part={p} />
                  })}
                </MessageContent>
              </Message>
            </div>
          ))}
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button key={s.label} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => send(s.prompt)}>
                  {s.label}
                </Button>
              ))}
            </div>
          ) : null}
          {thinking ? (
            <div>
              <Marker>
                <MarkerContent className="shimmer">考えています</MarkerContent>
              </Marker>
            </div>
          ) : null}
          {error ? (
            <div>
              <Marker>
                <MarkerIcon>
                  <WarningCircleIcon />
                </MarkerIcon>
                <MarkerContent className="text-destructive">{errorMessage(error)}</MarkerContent>
              </Marker>
            </div>
          ) : null}
        </div>
      </div>
      <div className={`sticky bottom-0 z-20 bg-background ${scroller ? '' : 'max-md:bottom-(--bottom-nav) max-md:motion-safe:transition-[bottom] max-md:duration-200'}`} style={{ transform: 'translateY(calc(-1 * var(--kb, 0px)))' }}>
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-t from-background to-transparent transition-opacity duration-200 ${fade.bottom ? 'opacity-100' : 'opacity-0'}`} />
        <div className={`mx-auto w-full max-w-3xl px-4 pt-2 ${scroller ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-12'}`}>
          {beforeComposer}
          <Composer onSubmit={send} onStop={stop} busy={busy} placeholder="続けて聞く" autoFocus={autoFocus} compact />
        </div>
      </div>
    </div>
  )
}

/** 質問に添えた頁の文脈。質問の吹き出しとは分けて、その上に小さく出す。選んだ文はいつも見せ、画面の様子は開いて読む */
function ContextNote({ text }: { text: string }) {
  const { quote, screen } = splitContext(text)
  return (
    <div className="mb-1.5 ml-auto flex max-w-[85%] flex-col items-end gap-1 text-xs text-muted-foreground">
      {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
      {quote ? <blockquote className="line-clamp-3 border-l-2 border-primary/60 pl-2.5 text-left">{quote}</blockquote> : null}
      {screen ? (
        <details className="group/ctx text-right">
          <summary className="cursor-pointer list-none select-none hover:text-foreground [&::-webkit-details-marker]:hidden">見ていた画面を添えています</summary>
          <p className="mt-1 whitespace-pre-wrap text-left">{screen}</p>
        </details>
      ) : null}
    </div>
  )
}

/** server の JSON のエラー（{ error: { message } }）なら、その文言を出す */
function errorMessage(error: Error) {
  try {
    const body = JSON.parse(error.message) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {}
  return error.message || '応答を受け取れませんでした'
}

