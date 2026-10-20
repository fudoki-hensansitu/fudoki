// 会話の履歴は毎回まるごと送り直すので、tool の結果が大きくても body の上限を超えないことを守る
import { expect, test } from 'bun:test'
import type { UIMessage } from 'ai'
import { forServer } from '../chat/history'
import { MAX_TOOL_TEXT, OMITTED, toolText } from '../tool-text'
import { MAX_CHAT_BODY_BYTES } from './limits'

const big = (n: number) => ({ content: [{ type: 'text', text: 'あ'.repeat(n) }], structuredContent: { rows: 'x'.repeat(n) } })

const tool = (toolName: string, output: unknown) =>
  ({ type: 'dynamic-tool', toolName, toolCallId: toolName, state: 'output-available', input: {}, output }) as UIMessage['parts'][number]

test('toolText は長い結果を切り詰め、二度切っても変わらない', () => {
  const once = toolText('search_expenditure_nodes', big(100_000))
  expect(once.length).toBeLessThan(MAX_TOOL_TEXT + 300)
  expect(toolText('search_expenditure_nodes', { content: [{ type: 'text', text: once }] })).toBe(once)
})

test('render_expenditure_view の結果は画面に出した旨だけを AI に渡す', () => {
  expect(toolText('render_expenditure_view', big(100_000))).not.toContain('あああ')
})

test('forServer は大きな結果を何回呼んでも body の上限に収める', () => {
  const messages: UIMessage[] = []
  for (let i = 0; i < 6; i++) {
    messages.push({ id: `u${i}`, role: 'user', parts: [{ type: 'text', text: '質問' }] })
    messages.push({
      id: `a${i}`,
      role: 'assistant',
      parts: [tool('search_expenditure_nodes', big(100_000)), tool('render_expenditure_view', big(100_000)), { type: 'text', text: '答え' }],
    })
  }
  const body = JSON.stringify({ id: 'x', messages: forServer(messages) })
  expect(new TextEncoder().encode(body).length).toBeLessThan(MAX_CHAT_BODY_BYTES)
})

test('forServer は最後の質問より前の結果を省き、今回の結果は残す', () => {
  const messages: UIMessage[] = [
    { id: 'u0', role: 'user', parts: [{ type: 'text', text: 'a' }] },
    { id: 'a0', role: 'assistant', parts: [tool('search_expenditure_nodes', big(100))] },
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'b' }] },
    { id: 'a1', role: 'assistant', parts: [tool('search_expenditure_nodes', big(100))] },
  ]
  const out = JSON.stringify(forServer(messages))
  expect(out).toContain(OMITTED)
  expect(out.match(/あ{100}/g)?.length).toBe(1)
  expect(out).not.toContain('structuredContent')
})
