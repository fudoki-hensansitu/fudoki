// 会話の token と履歴はブラウザの sessionStorage にだけ置く（サーバーは保存しない）。読めない環境でも動くように失敗は握りつぶす
import type { UIMessage } from 'ai'

export interface StoredSession {
  token: string
  expiresAt: number
  /** 入口で入力して、まだ送っていない最初の質問 */
  pending?: string
  messages?: UIMessage[]
}

const key = (id: string) => `fudoki:chat:${id}`

export function loadSession(id: string): StoredSession | undefined {
  try {
    const raw = sessionStorage.getItem(key(id))
    return raw ? (JSON.parse(raw) as StoredSession) : undefined
  } catch {
    return undefined
  }
}

/** 書けたら true。容量超過などでは履歴を残さない（会話の画面はそのまま続けられるが、入口からは移れない） */
export function saveSession(id: string, session: StoredSession): boolean {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(session))
    return true
  } catch {
    return false
  }
}
