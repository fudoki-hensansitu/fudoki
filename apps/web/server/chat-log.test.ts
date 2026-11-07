// 会話の保存に利用者の連絡先を残さないこと・ログインしていない古い会話を消すこと・保存の失敗で応答を落とさないことを確かめる
import { describe, expect, test } from 'bun:test'
import type { UIMessage } from 'ai'
import { CHAT_LOG_RETENTION_DAYS, redact, writeChatTurn, type ChatTurn } from './chat-log'
import { parseChat } from './chat'
import type { WebDatabase } from './env'

describe('会話の保存', () => {
  test('質問のメールアドレスと電話番号を伏せ、金額や年度は残す', () => {
    expect(redact('連絡は taro.y+1@example.co.jp か 090-1234-5678、03 1234 5678、+81-3-1234-5678 へ')).toBe(
      '連絡は [メール] か [電話番号]、[電話番号]、[電話番号] へ',
    )
    expect(redact('(03) 1234-5678 と 03(1234)5678 と ０９０－１２３４－５６７８')).toBe('[電話番号] と [電話番号] と [電話番号]')
    expect(redact('TEL090-1234-5678 と ＴＥＬ０９０－１２３４－５６７８')).toBe('TEL[電話番号] と TEL[電話番号]')
    expect(redact('taro＠example．com と ｔａｒｏ＿１＠ｅｘａｍｐｌｅ．ｊｐ')).toBe('[メール] と [メール]')
    expect(redact('品川区の2025年度の歳出 1234567円 と 0120 は？')).toBe('品川区の2025年度の歳出 1234567円 と 0120 は？')
  })

  test('最後の質問・ID・頁の文脈・何回目か・始めた頁を取り出し、頁の文脈は数えない', () => {
    const user = (id: string, text: string) => ({ id, role: 'user', parts: [{ type: 'text', text }] })
    const ai = { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] }
    const parsed = parseChat({ id: 'c', entry: '/tokyo/shinagawa', messages: [user('1', '一つ目'), ai, { ...user('2', '二つ目'), context: '選んだ文' }] })
    expect(parsed).toMatchObject({ question: '二つ目', questionId: '2', context: '選んだ文', turn: 2, entry: '/tokyo/shinagawa' })
    expect(parseChat({ id: 'c', entry: 'https://evil.example/', messages: [user('1', 'a')] }).entry).toBe('')
    expect(parseChat({ id: 'c', messages: [user('1', 'a')] }).entry).toBe('')
  })

  const answer = (parts: UIMessage['parts']): UIMessage => ({ id: 'a1', role: 'assistant', parts })
  const turn: ChatTurn = {
    conversationId: 'c',
    turn: 2,
    entry: '/',
    questionId: 'q2',
    question: 'mail a@b.jp',
    context: '選んだ文 090-1234-5678',
    answer: answer([{ type: 'text', text: '品川区は… a@b.jp へ' }]),
    model: 'm',
    error: '',
    inputTokens: 1,
    outputTokens: 2,
    steps: 1,
    durationMs: 3,
  }
  const fakeDb = (fail = false) => {
    const runs: { sql: string; values: unknown[] }[] = []
    const db: WebDatabase = {
      prepare: (sql) => {
        const statement = { bind: (...values: unknown[]) => (runs.push({ sql, values }), statement) }
        return statement
      },
      batch: () => (fail ? Promise.reject(new Error('D1 down')) : Promise.resolve([])),
    }
    return { db, runs }
  }
  const row = (runs: { sql: string; values: unknown[] }[], role: string) => runs.find((r) => r.sql.startsWith('INSERT OR REPLACE INTO messages') && r.values[3] === role)!.values

  test('質問と回答を2行で書き、質問・頁の文脈・回答の文は伏せ、ログインしていない古い会話を消す', async () => {
    const { db, runs } = fakeDb()
    const now = 1_000_000_000_000
    await writeChatTurn(db, turn, now)
    expect(runs[0]!.values).toEqual(['c', '/', now, now])
    expect(row(runs, 'user').slice(0, 6)).toEqual(['c', 3, 'q2', 'user', '[{"type":"text","text":"mail [メール]"}]', '選んだ文 [電話番号]'])
    expect(row(runs, 'assistant').slice(0, 5)).toEqual(['c', 4, 'a1', 'assistant', '[{"type":"text","text":"品川区は… [メール] へ"}]'])
    const deletes = runs.filter((r) => r.sql.startsWith('DELETE'))
    expect(deletes.map((r) => r.sql.includes('user_id IS NULL'))).toEqual([true, true])
    expect(deletes.map((r) => r.values)).toEqual([[now - CHAT_LOG_RETENTION_DAYS * 86_400_000], [now - CHAT_LOG_RETENTION_DAYS * 86_400_000]])
  })

  test('回答の tool の引数は伏せ、長すぎる結果は落として JSON のまま残す', async () => {
    const tool = (output: unknown) =>
      ({ type: 'dynamic-tool', toolName: 'search', toolCallId: 't', state: 'output-available', input: { q: '連絡先\nfoo@example.com TEL090-1234-5678', limit: 5 }, output }) as UIMessage['parts'][number]
    const { db, runs } = fakeDb()
    await writeChatTurn(db, { ...turn, answer: answer([tool({ rows: [1] })]) })
    expect(JSON.parse(row(runs, 'assistant')[4] as string)[0]).toMatchObject({ input: { q: '連絡先\n[メール] TEL[電話番号]', limit: 5 }, output: { rows: [1] } })
    const big = fakeDb()
    await writeChatTurn(big.db, { ...turn, answer: answer([tool({ rows: 'あ'.repeat(300_000) }), { type: 'text', text: 'まとめ' }]) })
    const parts = JSON.parse(big.runs.find((r) => r.values[3] === 'assistant')!.values[4] as string)
    expect(parts[0]).toMatchObject({ toolName: 'search', outputDropped: true })
    expect(parts[0].output).toBeUndefined()
    expect(parts[1]).toEqual({ type: 'text', text: 'まとめ' })
  })

  test('応答前に失敗して回答が無くても、失敗を書く', async () => {
    const { db, runs } = fakeDb()
    const { answer: _answer, ...noAnswer } = turn
    await writeChatTurn(db, { ...noAnswer, error: 'mcp' })
    expect(row(runs, 'assistant').slice(4, 8)).toEqual(['[]', '', 'm', 'mcp'])
  })

  test('保存の失敗は投げず、binding が無ければ何もしない', async () => {
    await expect(writeChatTurn(fakeDb(true).db, turn)).resolves.toBeUndefined()
    await expect(writeChatTurn(undefined, turn)).resolves.toBeUndefined()
  })
})
