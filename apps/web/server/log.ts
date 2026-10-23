// Workers の observability は console の出力をすべて残す。AI SDK のエラー（APICallError など）は
// requestBodyValues に会話の全文を、responseBody に応答を持つので、そのまま出すと会話を保存したことになる。
// ログには名前・短い文言・HTTP の状態と、包まれたエラーの名前だけを出す
const MAX_MESSAGE = 200

const field = (e: unknown, key: string): unknown => (e && typeof e === 'object' ? (e as Record<string, unknown>)[key] : undefined)
const nameOf = (e: unknown) => {
  const name = field(e, 'name')
  return typeof name === 'string' ? name : e === undefined || e === null ? undefined : typeof e
}

/** ログに出してよい形にする。requestBodyValues・responseBody・stack などは持ち出さない */
export function safeError(e: unknown) {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : undefined
  const statusCode = field(e, 'statusCode')
  const lastError = nameOf(field(e, 'lastError'))
  const cause = nameOf(field(e, 'cause'))
  return {
    name: nameOf(e) ?? 'unknown',
    ...(message ? { message: message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message } : {}),
    ...(typeof statusCode === 'number' ? { statusCode } : {}),
    ...(lastError ? { lastError } : {}),
    ...(cause ? { cause } : {}),
  }
}

export function logError(e: unknown) {
  console.error(safeError(e))
}

/** AI の1段（モデルの1回の呼び出しと、続く tool の実行）の所要時間と token。名前と数だけで、会話の本文は持たない */
export interface StepLogInput {
  stepNumber: number
  finishReason: string
  usage: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number }; outputTokenDetails?: { reasoningTokens?: number } }
  toolCalls: { toolCallId: string; toolName: string }[]
  performance: { stepTimeMs: number; responseTimeMs: number; timeToFirstOutputMs?: number; toolExecutionMs: Readonly<Record<string, number>> }
}

/** 遅さの切り分け用。start はモデルを待った時間（first は最初の出力まで）、tools は tool ごとの実行時間 */
export function stepLog(s: StepLogInput) {
  const tools: Record<string, number> = {}
  for (const call of s.toolCalls) tools[call.toolName] = (tools[call.toolName] ?? 0) + Math.round(s.performance.toolExecutionMs[call.toolCallId] ?? 0)
  return {
    event: 'chat.step',
    step: s.stepNumber,
    finish: s.finishReason,
    inputTokens: s.usage.inputTokens ?? 0,
    cachedTokens: s.usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: s.usage.outputTokens ?? 0,
    reasoningTokens: s.usage.outputTokenDetails?.reasoningTokens ?? 0,
    stepMs: Math.round(s.performance.stepTimeMs),
    modelMs: Math.round(s.performance.responseTimeMs),
    firstMs: s.performance.timeToFirstOutputMs === undefined ? null : Math.round(s.performance.timeToFirstOutputMs),
    toolMs: tools,
  }
}

/** 1回の応答の内訳。connectMs は風土記の MCP に繋いで tool を取るまで、totalMs は応答の開始から終わりまで */
export function logTiming(e: { connectMs: number; totalMs: number; steps: number; error: string }) {
  console.log({ event: 'chat.done', ...e })
}

export function logStep(s: StepLogInput) {
  console.log(stepLog(s))
}
