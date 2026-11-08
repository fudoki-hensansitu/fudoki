import { expect, test } from 'bun:test'
import { MAX_PAGE_CHARS, readSourcePage, type SourceTextBucket } from './source-pages'
import { testDb } from './testing'

const SHA = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function setup(pages: string[]) {
  const { db, sqlite } = testDb()
  sqlite.query(`INSERT INTO fiscal_origin (origin_id, jurisdiction_code, fiscal_year, document_kind, title, url, format, sha256) VALUES (?,?,?,?,?,?,?,?)`)
    .run('o1', '131091', 2026, 'initial', '予算書', 'https://city.example.jp/a.pdf', 'pdf', SHA)
  const keys: string[] = []
  const bucket: SourceTextBucket = {
    async get(key) {
      keys.push(key)
      return key === `source-text/${SHA}.json` ? { text: async () => JSON.stringify({ schema_version: 1, sha256: SHA, pages }) } : null
    },
  }
  return { db, bucket, keys }
}

test('origin_id か sha256 で出典の頁の文字と公式の URL を返す', async () => {
  const { db, bucket } = setup(['1頁', '2頁の本文'])
  for (const origin of ['o1', SHA]) {
    expect(await readSourcePage(db, bucket, { origin, page: 2 })).toEqual({
      status: 'ok', origin_sha256: SHA, title: '予算書', url: 'https://city.example.jp/a.pdf', page: 2, page_count: 2, text: '2頁の本文', truncated: false,
    })
  }
})

test('風土記の出典に無いものは R2 を読まない（key を入力から組み立てない）', async () => {
  const { db, bucket, keys } = setup(['x'])
  for (const origin of [OTHER, '../fiscal/ingestion/x', `source-text/${SHA}.json`])
    expect((await readSourcePage(db, bucket, { origin, page: 1 })).status).toBe('not_found')
  expect(keys).toEqual([])
})

test('頁の範囲外と不正な入力は invalid、長い頁は上限で切る', async () => {
  const { db, bucket } = setup(['あ'.repeat(MAX_PAGE_CHARS + 10)])
  expect((await readSourcePage(db, bucket, { origin: 'o1', page: 2 })).status).toBe('invalid')
  expect((await readSourcePage(db, bucket, { origin: 'o1', page: 0 })).status).toBe('invalid')
  expect((await readSourcePage(db, bucket, { origin: 'o1', page: 1, key: 'x' })).status).toBe('invalid')
  const r = await readSourcePage(db, bucket, { origin: 'o1', page: 1 })
  expect(r.status === 'ok' && [r.text.length, r.truncated]).toEqual([MAX_PAGE_CHARS, true])
})
