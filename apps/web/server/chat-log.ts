// 風土記の AI との会話を、改善のための分析用に D1（CHAT_LOG）へ1往復1行で書く。表は migrations/0001_chat_turns.sql。
// 利用者を特定する情報（IP・UA・cookie）と AI の回答本文は書かない。質問のメールアドレス・電話番号の形は伏せ、90日を過ぎた行は書くたびに消す
import type { ChatLogDatabase } from './env'
import { logError } from './log'

/** 記録を残す日数。プライバシーポリシー（apps/docs の legal）と入力欄の下の注記に同じ日数を書いている */
export const CHAT_LOG_RETENTION_DAYS = 90
/** tool の引数の JSON をこの文字数で切る（検索条件が分かれば足りる） */
const MAX_TOOL_CALLS_CHARS = 4000

export interface ChatTurn {
  conversationId: string
  turn: number
  entry: string
  question: string
  toolCalls: { name: string; input: unknown }[]
  model: string
  error: string
  inputTokens: number
  outputTokens: number
  steps: number
  durationMs: number
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// 0 から始まる国内の番号（ハイフン・空白あり／なし）と +81 の番号。金額や年度（4桁まで）を巻き込まないよう 10 桁以上だけを伏せる
// 括弧の市外局番（(03) 1234-5678・03(1234)5678）も含める。全角の数字・＋－（）は先に半角にする（他の字は変えない）
const PHONE = /(?:\+81[-\s]?(?:\(0\))?|\(?\b0)\d{1,4}\)?[-\s]?\(?\d{1,4}\)?[-\s]?\d{3,4}\b/g

/** 文からメールアドレス・電話番号の形のものを伏せる */
export function redact(text: string): string {
  return text.replace(/[０-９＋－（）]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(EMAIL, '[メール]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[電話番号]' : m))
}

export function writeChatTurn(db: ChatLogDatabase | undefined, t: ChatTurn, now = Date.now()): Promise<unknown> {
  if (!db) return Promise.resolve()
  // AI が質問の文を tool の引数に写すことがあるので、引数の文字列も伏せる
  const calls = JSON.stringify(t.toolCalls, (_, v: unknown) => (typeof v === 'string' ? redact(v) : v))
  return db
    .batch([
      db
        .prepare(
          'INSERT INTO chat_turns (conversation_id, turn, entry, question, tool_calls, model, error, input_tokens, output_tokens, steps, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(t.conversationId, t.turn, t.entry, redact(t.question), calls.length > MAX_TOOL_CALLS_CHARS ? calls.slice(0, MAX_TOOL_CALLS_CHARS) : calls, t.model, t.error, t.inputTokens, t.outputTokens, t.steps, t.durationMs, now),
      db.prepare('DELETE FROM chat_turns WHERE created_at < ?').bind(now - CHAT_LOG_RETENTION_DAYS * 86_400_000),
    ])
    .catch((e: unknown) => {
      // 記録の失敗で応答を落とさない
      logError(e)
    })
}
