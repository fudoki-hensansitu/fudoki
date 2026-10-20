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
