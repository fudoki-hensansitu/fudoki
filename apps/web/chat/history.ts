// ブラウザが持つ会話の履歴を、/api/chat へ送る形にする。AI が読むのは tool の結果の text だけで、
// 送るたびに履歴の全部を送り直すので、結果の大きさがそのまま body の大きさ（server/limits.ts の MAX_CHAT_BODY_BYTES）になる
import type { UIMessage } from 'ai'
import { OMITTED, toolText } from '../tool-text'

type Part = UIMessage['parts'][number]

/** server/limits.ts の MAX_VIEW_CONTEXT と同じ。利用者の発言に付ける、頁で見ているものの長さの上限 */
export const MAX_CONTEXT = 2000
/** 利用者の発言の metadata。context は質問とは別に AI に渡す、頁で見ているもの・選んだ文 */
export type UserMetadata = { context?: string }
/** context の中で選んだ文の行に付ける見出し */
export const QUOTE_PREFIX = '選んだ文: '

/** context を選んだ文と、それ以外（頁で見ている画面）に分ける。選んだ文は会話の発言に、画面は system prompt に入れる */
export function splitContext(context: string): { quote: string; screen: string } {
  const lines = context.split('\n')
  const quote = lines.find((l) => l.startsWith(QUOTE_PREFIX))?.slice(QUOTE_PREFIX.length) ?? ''
  const screen = lines.filter((l) => !l.startsWith(QUOTE_PREFIX)).join('\n')
  return { quote, screen }
}

/** View 用の structuredContent と _meta を外し、text は server が AI に渡す形に切り詰める。最後の利用者の発言より前の回の結果は省く */
export function forServer<M extends UIMessage>(messages: M[]) {
  const lastUser = messages.findLastIndex((m) => m.role === 'user')
  return messages.map((m, i) => ({
    id: m.id,
    role: m.role,
    ...(m.role === 'user' && typeof (m.metadata as UserMetadata | undefined)?.context === 'string' ? { context: (m.metadata as UserMetadata).context!.slice(0, MAX_CONTEXT) } : {}),
    parts: m.parts
      .filter((p) => p.type === 'text' || p.type === 'step-start' || p.type === 'dynamic-tool')
      .map((p: Part) => {
        if (p.type !== 'dynamic-tool' || p.state !== 'output-available') return p
        const isError = !!(p.output as { isError?: boolean } | undefined)?.isError
        const text = i < lastUser ? OMITTED : toolText(p.toolName, p.output)
        return { ...p, output: { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) } }
      }),
  }))
}
