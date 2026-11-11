// 会話の token と履歴はブラウザの sessionStorage にだけ置く（サーバーは保存しない）。読めない環境でも動くように失敗は握りつぶす
import type { UIMessage } from 'ai'

export interface StoredSession {
  token: string
  expiresAt: number
  /** 入口で入力して、まだ送っていない最初の質問 */
  pending?: string
  /** 最初の質問を書いたときに頁で見ていたもの・選んだ文（選んだ文は質問の直前の利用者の発言に、見ている画面は最後の質問のものだけを system prompt に入れて AI に渡す） */
  pendingContext?: string
  /** 表とグラフの View が伝える、いま画面で見ているもの（system に参考として渡す） */
  viewContext?: string
  /** 会話を始めた頁のパス（例: /tokyo/shinagawa）。どこから聞かれたかを質問の記録に残す */
  entry?: string
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
