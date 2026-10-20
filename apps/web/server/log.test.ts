// 段ごとの所要時間のログは、名前と数だけを出す（会話の本文・tool の入出力を持ち出さない）
import { expect, test } from 'bun:test'
import { stepLog, type StepLogInput } from './log'

test('stepLog は tool の名前ごとの実行時間と token だけを出し、本文は出さない', () => {
  const step = {
    stepNumber: 1,
    finishReason: 'tool-calls',
    usage: { inputTokens: 1200, outputTokens: 300, inputTokenDetails: { cacheReadTokens: 1000 }, outputTokenDetails: { reasoningTokens: 250 } },
    toolCalls: [
      { toolCallId: 'a', toolName: 'search_expenditure_nodes', input: { q: '秘密の質問' } },
      { toolCallId: 'b', toolName: 'search_expenditure_nodes', input: {} },
    ],
    performance: { stepTimeMs: 5400.6, responseTimeMs: 4000.2, timeToFirstOutputMs: 900.4, toolExecutionMs: { a: 700.2, b: 300.4 } },
    text: '利用者に見せる本文',
    content: [{ type: 'text', text: '本文' }],
  } as unknown as StepLogInput
  const out = stepLog(step)
  expect(out).toEqual({
    event: 'chat.step', step: 1, finish: 'tool-calls',
    inputTokens: 1200, cachedTokens: 1000, outputTokens: 300, reasoningTokens: 250,
    stepMs: 5401, modelMs: 4000, firstMs: 900, toolMs: { search_expenditure_nodes: 1000 },
  })
  expect(JSON.stringify(out)).not.toContain('秘密')
})
