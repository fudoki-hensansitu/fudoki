// アシスタントに渡す風土記の tool。apps/api の内部の RPC（Web の tools・runTool）を AI SDK の tool に包む。MCP は使わない。
// 結果は MCP の tool の結果と同じ形（content の text と、次の質問の候補の _meta）にし、会話の画面（chat/history.ts・conversation.tsx）がそのまま読む
import { dynamicTool, jsonSchema, type ToolSet } from 'ai'
import { SUGGESTIONS_META_KEY } from '../../../packages/fiscal/suggestions'
import { toolText } from '../tool-text'
import type { Env } from './env'
import { fudokiApi } from './fudoki-api'

const text = (value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]

/** 1回の会話の tool。定義は api から引き、呼び出しも api の内部の RPC に送る */
export async function fudokiTools(env: Pick<Env, 'WEB'>): Promise<ToolSet> {
  const rpc = fudokiApi(env)
  const defs = await rpc.tools()
  return Object.fromEntries(
    defs.map((def) => [
      def.name,
      dynamicTool({
        description: def.description,
        inputSchema: jsonSchema(def.inputSchema),
        execute: async (input) => {
          const r = await rpc.runTool(def.name, input)
          if (!r.ok) return { isError: true, content: text({ error: { code: r.code, message: r.message } }) }
          const { value, suggestions } = r.value
          return { content: text(value), ...(suggestions.length > 0 ? { _meta: { [SUGGESTIONS_META_KEY]: suggestions } } : {}) }
        },
        // AI に渡すのは text の側だけ。長い結果は上限で切る
        toModelOutput: ({ output }) => ({ type: 'text', value: toolText(output) }),
      }),
    ]),
  )
}
