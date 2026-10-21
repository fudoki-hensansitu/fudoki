// 会話の画面（/s/:id）。履歴はブラウザだけが持ち、送るたびに web の Worker（/api/chat）へ渡す。
// AI が描画 tool を呼んだ結果は、apps/api の MCP Apps の View を iframe に置いて見せる（独自の表は作らない）
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type DynamicToolUIPart, type UIMessage } from 'ai'
import { CheckIcon, CircleAlertIcon, SquarePenIcon } from 'lucide-react'
import { readSuggestions } from '../../../packages/fiscal/suggestions'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { Composer } from './composer'
import { forServer } from './history'
import { Markdown } from './markdown'
import { loadSession, saveSession, type StoredSession } from './store'
import { ViewFrame } from './view-frame'
import { LOGO_G } from '../logo'

/** 一番下からこの距離以内なら、読み終えて追っていると見なす */
const NEAR_BOTTOM_PX = 120

type Metadata = { apps?: Record<string, string> }
type ChatMessage = UIMessage<Metadata>

const TOOL_LABELS: Record<string, string> = {
  search_expenditure_nodes: '支出を検索',
  get_expenditure_node: '明細を開く',
  list_jurisdictions: '収録している自治体を確認',
  describe_expenditure_columns: '列の意味を確認',
  search_evaluations: '事業の評価を検索',
  render_expenditure_view: '表とグラフを用意',
}

function ToolMarker({ part }: { part: DynamicToolUIPart }) {
  const label = TOOL_LABELS[part.toolName] ?? part.toolName
  const failed = part.state === 'output-error' || (part.state === 'output-available' && (part.output as { isError?: boolean })?.isError)
  const done = part.state === 'output-available' && !failed
  return (
    <Marker>
      <MarkerIcon>{failed ? <CircleAlertIcon /> : done ? <CheckIcon /> : <Spinner />}</MarkerIcon>
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

function Session({ id, stored }: { id: string; stored: StoredSession }) {
  const viewContext = React.useRef('')
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: '/api/chat',
        headers: { Authorization: `Bearer ${stored.token}` },
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { id, messages: forServer(messages), ...(viewContext.current ? { viewContext: viewContext.current } : {}) },
        }),
      }),
    [id, stored.token],
  )
  const { messages, sendMessage, status, stop, error } = useChat<ChatMessage>({
    id,
    messages: (stored.messages ?? []) as ChatMessage[],
    transport,
    onFinish: ({ messages }) => saveSession(id, { token: stored.token, expiresAt: stored.expiresAt, messages }),
  })
  const busy = status === 'submitted' || status === 'streaming'
  const send = React.useCallback((text: string) => void sendMessage({ text }), [sendMessage])
  // 入口で入力した最初の質問を1回だけ送る（StrictMode の二重実行でも1回）
  const sent = React.useRef(false)
  React.useEffect(() => {
    if (sent.current || !stored.pending) return
    sent.current = true
    saveSession(id, { token: stored.token, expiresAt: stored.expiresAt, messages: stored.messages })
    send(stored.pending)
  }, [id, stored, send])

  // 一番下を読んでいる間は、送ったときも配信中も画面全体を最下部へ追う。利用者が上へ遡ったら追わない
  // メッセージは自分の scroll 領域に置く（上下端を scroll-fade でぼかすため、頁ではなくこの領域が動く）
  const scroller = React.useRef<HTMLDivElement>(null)
  const pinned = React.useRef(true)
  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  React.useEffect(() => {
    const el = scroller.current
    if (status === 'submitted') pinned.current = true
    if (pinned.current && el) el.scrollTo({ top: el.scrollHeight })
  }, [messages, status])

  const suggestions = busy ? [] : suggestionsOf(messages.at(-1))
  // 応答の生成中で、いま画面に動くものが無い間（送った直後・tool の完了後・文の前）は「考えています」を出す。止まって見えないように
  const last = messages.at(-1)?.parts.at(-1)
  const thinking =
    status === 'submitted' ||
    (status === 'streaming' &&
      !(last?.type === 'text' && last.state === 'streaming') &&
      !(last?.type === 'dynamic-tool' && last.state !== 'output-available' && last.state !== 'output-error'))
  const apps = (m: ChatMessage) => m.metadata?.apps ?? {}
  return (
    <div className="flex h-dvh w-full flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" aria-label="風土記 ホーム" className="text-primary">
          <svg className="block h-7 w-auto" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 146.2150 40" role="img" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
        </a>
        <a href="/" aria-label="新しい会話" title="新しい会話" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <SquarePenIcon className="size-5" />
        </a>
      </header>
      <div ref={scroller} className="scroll-fade min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-4 pb-6">
          {messages.map((m) => (
            <div key={m.id}>
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
                        <ViewFrame key={i} token={stored.token} uri={uri} input={p.input} output={output} onContext={(text) => (viewContext.current = text.slice(0, 2000))} />
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
                  <CircleAlertIcon />
                </MarkerIcon>
                <MarkerContent className="text-destructive">{errorMessage(error)}</MarkerContent>
              </Marker>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 pb-6 sm:pb-8">
        <Composer onSubmit={send} onStop={stop} busy={busy} placeholder="続けて聞く" autoFocus pill compact />
      </div>
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

function Expired() {
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p>この会話はこのブラウザに残っていないか、期限が切れました。会話は保存していないため、最初から聞き直してください。</p>
      <a href="/" className="text-primary underline underline-offset-4">風土記のトップへ</a>
    </div>
  )
}

const root = document.getElementById('chat-session')
const id = location.pathname.split('/').at(-1) ?? ''
const stored = loadSession(id)
if (root)
  createRoot(root).render(
    <React.StrictMode>{stored && stored.expiresAt * 1000 > Date.now() ? <Session id={id} stored={stored} /> : <Expired />}</React.StrictMode>,
  )
