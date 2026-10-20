// 会話の画面（/s/:id）。履歴はブラウザだけが持ち、送るたびに web の Worker（/api/chat）へ渡す。
// AI が描画 tool を呼んだ結果は、apps/api の MCP Apps の View を iframe に置いて見せる（独自の表は作らない）
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type DynamicToolUIPart, type UIMessage } from 'ai'
import { CheckIcon, CircleAlertIcon, SquarePenIcon } from 'lucide-react'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { Composer } from './composer'
import { Markdown } from './markdown'
import { loadSession, saveSession, type StoredSession } from './store'
import { ViewFrame } from './view-frame'

type Metadata = { apps?: Record<string, string> }
type ChatMessage = UIMessage<Metadata>

const TOOL_LABELS: Record<string, string> = {
  search_expenditure_nodes: '歳出を検索',
  get_expenditure_node: '明細を開く',
  list_jurisdictions: '収録している団体を確認',
  search_evaluations: '事業の評価を検索',
  render_expenditure_view: '表とグラフを用意',
}

/** 送る履歴から View 用の structuredContent と _meta を外す。AI は text しか読まないので、body を小さくする */
function forServer(messages: ChatMessage[]) {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts
      .filter((p) => p.type === 'text' || p.type === 'step-start' || p.type === 'dynamic-tool')
      .map((p) => {
        if (p.type !== 'dynamic-tool' || p.state !== 'output-available') return p
        const out = p.output as { content?: unknown; isError?: boolean } | undefined
        return { ...p, output: { content: out?.content ?? [], ...(out?.isError ? { isError: true } : {}) } }
      }),
  }))
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
  // View の「チャットで聞く」は、応答の生成中には送らない（2つの応答が同じ会話に書き込まないように）
  const busyRef = React.useRef(busy)
  React.useLayoutEffect(() => {
    busyRef.current = busy
  }, [busy])
  const sendFromView = React.useCallback((text: string) => {
    if (!busyRef.current) send(text)
  }, [send])

  // 入口で入力した最初の質問を1回だけ送る（StrictMode の二重実行でも1回）
  const sent = React.useRef(false)
  React.useEffect(() => {
    if (sent.current || !stored.pending) return
    sent.current = true
    saveSession(id, { token: stored.token, expiresAt: stored.expiresAt, messages: stored.messages })
    send(stored.pending)
  }, [id, stored, send])

  // 送ったら、画面全体を一番下まで送る
  React.useEffect(() => {
    if (status === 'submitted') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }, [status])

  const apps = (m: ChatMessage) => m.metadata?.apps ?? {}
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" className="font-medium text-primary">風土記</a>
        <a href="/" aria-label="新しい会話" title="新しい会話" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <SquarePenIcon className="size-5" />
        </a>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
      <div className="flex flex-1 flex-col gap-4 pb-6">
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
                            <ViewFrame key={i} token={stored.token} uri={uri} input={p.input} output={output} onMessage={sendFromView} onContext={(text) => (viewContext.current = text.slice(0, 2000))} />
                          )
                        return <ToolMarker key={i} part={p} />
                      })}
                    </MessageContent>
                  </Message>
                </div>
              ))}
              {status === 'submitted' ? (
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
      <div className="sticky bottom-0 bg-background pt-2 pb-4 max-sm:pb-2">
        <Composer onSubmit={send} onStop={stop} busy={busy} placeholder="続けて聞く" autoFocus compact />
      </div>
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
