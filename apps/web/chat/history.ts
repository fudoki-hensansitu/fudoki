// ブラウザが持つ会話の履歴を、/api/chat へ送る形にする。AI が読むのは tool の結果の text だけで、
// 送るたびに履歴の全部を送り直すので、結果の大きさがそのまま body の大きさ（server/limits.ts の MAX_CHAT_BODY_BYTES）になる
import type { UIMessage } from 'ai'
import { OMITTED, toolText } from '../tool-text'

type Part = UIMessage['parts'][number]

/** View 用の structuredContent と _meta を外し、text は server が AI に渡す形に切り詰める。最後の利用者の発言より前の回の結果は省く */
export function forServer<M extends UIMessage>(messages: M[]) {
  const lastUser = messages.findLastIndex((m) => m.role === 'user')
  return messages.map((m, i) => ({
    id: m.id,
    role: m.role,
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
