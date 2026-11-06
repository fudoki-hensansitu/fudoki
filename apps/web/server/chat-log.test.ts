// 会話の記録に利用者の連絡先を残さないこと・古い行を消すこと・記録の失敗で応答を落とさないことを確かめる
import { describe, expect, test } from 'bun:test'
import { CHAT_LOG_RETENTION_DAYS, redact, writeChatTurn, type ChatTurn } from './chat-log'
import { parseChat } from './chat'
import type { ChatLogDatabase } from './env'

describe('会話の記録', () => {
  test('質問のメールアドレスと電話番号を伏せ、金額や年度は残す', () => {
    expect(redact('連絡は taro.y+1@example.co.jp か 090-1234-5678、03 1234 5678、+81-3-1234-5678 へ')).toBe(
      '連絡は [メール] か [電話番号]、[電話番号]、[電話番号] へ',
    )
    expect(redact('(03) 1234-5678 と 03(1234)5678 と ０９０－１２３４－５６７８')).toBe('[電話番号] と [電話番号] と [電話番号]')
    expect(redact('TEL090-1234-5678 と ＴＥＬ０９０－１２３４－５６７８')).toBe('TEL[電話番号] と TEL[電話番号]')
    expect(redact('taro＠example．com と ｔａｒｏ＿１＠ｅｘａｍｐｌｅ．ｊｐ')).toBe('[メール] と [メール]')
    expect(redact('品川区の2025年度の歳出 1234567円 と 0120 は？')).toBe('品川区の2025年度の歳出 1234567円 と 0120 は？')
  })

  test('最後の質問・何回目か・始めた頁を取り出し、頁の文脈は数えない', () => {
    const user = (id: string, text: string) => ({ id, role: 'user', parts: [{ type: 'text', text }] })
    const ai = { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] }
    const parsed = parseChat({ id: 'c', entry: '/tokyo/shinagawa', messages: [user('1', '一つ目'), ai, { ...user('2', '二つ目'), context: '選んだ文' }] })
    expect(parsed).toMatchObject({ question: '二つ目', turn: 2, entry: '/tokyo/shinagawa' })
    expect(parseChat({ id: 'c', entry: 'https://evil.example/', messages: [user('1', 'a')] }).entry).toBe('')
    expect(parseChat({ id: 'c', messages: [user('1', 'a')] }).entry).toBe('')
  })

  const turn: ChatTurn = { conversationId: 'c', turn: 1, entry: '/', question: 'mail a@b.jp', toolCalls: [{ name: 'search', input: { q: 'x' } }], model: 'm', error: '', inputTokens: 1, outputTokens: 2, steps: 1, durationMs: 3 }
  const fakeDb = (fail = false) => {
    const runs: { sql: string; values: unknown[] }[] = []
    const db: ChatLogDatabase = {
      prepare: (sql) => {
        const statement = { bind: (...values: unknown[]) => (runs.push({ sql, values }), statement) }
        return statement
      },
      batch: () => (fail ? Promise.reject(new Error('D1 down')) : Promise.resolve([])),
    }
    return { db, runs }
  }

  test('伏せた質問を書き、保存期間を過ぎた行を消す', async () => {
    const { db, runs } = fakeDb()
    await writeChatTurn(db, turn, 1_000_000_000_000)
    expect(runs[0]!.values[3]).toBe('mail [メール]')
    expect(runs[0]!.values[4]).toBe('[{"name":"search","input":{"q":"x"}}]')
    expect(runs[1]!.sql).toContain('DELETE')
    expect(runs[1]!.values).toEqual([1_000_000_000_000 - CHAT_LOG_RETENTION_DAYS * 86_400_000])
  })

  test('tool の引数の文字列も伏せる', async () => {
    const { db, runs } = fakeDb()
    await writeChatTurn(db, { ...turn, toolCalls: [{ name: 'search', input: { q: '連絡先\nfoo@example.com TEL090-1234-5678', limit: 5 } }] })
    expect(JSON.parse(runs[0]!.values[4] as string)).toEqual([{ name: 'search', input: { q: '連絡先\n[メール] TEL[電話番号]', limit: 5 } }])
  })

  test('長すぎる tool の引数は落とし、JSON のまま名前だけを残す', async () => {
    const { db, runs } = fakeDb()
    await writeChatTurn(db, { ...turn, toolCalls: [{ name: 'search', input: { q: 'あ'.repeat(5000) } }] })
    expect(JSON.parse(runs[0]!.values[4] as string)).toEqual([{ name: 'search', truncated: true }])
  })

  test('記録の失敗は投げず、binding が無ければ何もしない', async () => {
    await expect(writeChatTurn(fakeDb(true).db, turn)).resolves.toBeUndefined()
    await expect(writeChatTurn(undefined, turn)).resolves.toBeUndefined()
  })
})
