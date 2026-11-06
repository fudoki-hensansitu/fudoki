// 風土記の AI との会話を web の D1（binding DB・fudoki-web）に保存する。表は migrations/0001_conversations.sql。あとで会話を開き直す（復元）のと、改善の分析の両方に使う。
// 利用者を特定する情報（IP・UA・cookie）は書かない。利用者が書いたものと、AI がそれを写しうるもの（質問・頁の文脈・tool の引数・回答の文）のメールアドレス・電話番号の形は伏せる。tool の結果は風土記の公開データなので伏せない。
// ログインしていない会話は、最後の発言から90日を過ぎたら書くたびに消す
import type { UIMessage } from 'ai'
import type { WebDatabase } from './env'
import { logError } from './log'

/** ログインしていない会話を残す日数。プライバシーポリシー（apps/docs の legal）と入力欄の下の注記に同じ日数を書いている */
export const CHAT_LOG_RETENTION_DAYS = 90
/** 回答の parts の JSON がこの文字数を超えたら、tool の結果を落とす（それでも超えたら回答の文だけにする） */
const MAX_PARTS_CHARS = 200_000

export interface ChatTurn {
  conversationId: string
  /** 何回目の質問か（1 から） */
  turn: number
  entry: string
  questionId: string
  question: string
  context: string
  /** 画面に送った AI の回答。応答を始める前に失敗したときは無い */
  answer?: UIMessage
  model: string
  error: string
  inputTokens: number
  outputTokens: number
  steps: number
  durationMs: number
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// 0 から始まる国内の番号（ハイフン・空白あり／なし）と +81 の番号。金額や年度（4桁まで）を巻き込まないよう 10 桁以上だけを伏せる
// 前後が数字でなければ英字に続いても（TEL090-…）伏せる。括弧の市外局番（(03) 1234-5678・03(1234)5678）も含める。全角の英数字・＋－（）＠．＿は先に半角にする（他の字は変えない）
const PHONE = /(?:\+81[-\s]?(?:\(0\))?|\(?(?<!\d)0)\d{1,4}\)?[-\s]?\(?\d{1,4}\)?[-\s]?\d{3,4}(?!\d)/g

/** 文からメールアドレス・電話番号の形のものを伏せる */
export function redact(text: string): string {
  return text.replace(/[０-９Ａ-Ｚａ-ｚ＋－（）＠．＿]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(EMAIL, '[メール]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[電話番号]' : m))
}

type Part = UIMessage['parts'][number]

/** 回答の parts を保存する JSON にする。tool の引数と回答の文は伏せ、長すぎるときは tool の結果、次に文以外を落とす */
export function answerParts(parts: Part[]): string {
  const hide = (p: Part): Part => {
    if (p.type === 'text') return { ...p, text: redact(p.text) }
    return 'input' in p && p.input !== undefined ? ({ ...p, input: JSON.parse(JSON.stringify(p.input, (_, v: unknown) => (typeof v === 'string' ? redact(v) : v))) } as Part) : p
  }
  const full = JSON.stringify(parts.filter((p) => p.type !== 'reasoning').map(hide))
  if (full.length <= MAX_PARTS_CHARS) return full
  const withoutOutput = JSON.stringify(
    parts.filter((p) => p.type !== 'reasoning').map((p) => {
      const { output: _output, ...rest } = hide(p) as Part & { output?: unknown }
      return 'output' in p ? ({ ...rest, outputDropped: true } as unknown as Part) : rest
    }),
  )
  if (withoutOutput.length <= MAX_PARTS_CHARS) return withoutOutput
  return JSON.stringify(parts.filter((p) => p.type === 'text').map((p) => ({ ...p, text: redact((p as { text: string }).text).slice(0, MAX_PARTS_CHARS / 2) })))
}

/** 1往復（質問と回答の2行）を書き、ログインしていない古い会話を消す。失敗しても応答は落とさない */
export function writeChatTurn(db: WebDatabase | undefined, t: ChatTurn, now = Date.now()): Promise<unknown> {
  if (!db) return Promise.resolve()
  const expired = now - CHAT_LOG_RETENTION_DAYS * 86_400_000
  const insertMessage =
    'INSERT OR REPLACE INTO messages (conversation_id, seq, message_id, role, parts, context, model, error, input_tokens, output_tokens, steps, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  return db
    .batch([
      db
        .prepare('INSERT INTO conversations (id, user_id, entry, created_at, updated_at) VALUES (?, NULL, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at')
        .bind(t.conversationId, t.entry, now, now),
      db
        .prepare(insertMessage)
        .bind(t.conversationId, t.turn * 2 - 1, t.questionId, 'user', JSON.stringify([{ type: 'text', text: redact(t.question) }]), redact(t.context), null, null, null, null, null, null, now),
      db
        .prepare(insertMessage)
        .bind(t.conversationId, t.turn * 2, t.answer?.id ?? '', 'assistant', answerParts(t.answer?.parts ?? []), '', t.model, t.error, t.inputTokens, t.outputTokens, t.steps, t.durationMs, now),
      db.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id IS NULL AND updated_at < ?)').bind(expired),
      db.prepare('DELETE FROM conversations WHERE user_id IS NULL AND updated_at < ?').bind(expired),
    ])
    .catch((e: unknown) => {
      // 保存の失敗で応答を落とさない
      logError(e)
    })
}
