import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { readSourcePage } from './source-pages'
import { testDb } from './testing'

const SHA = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function setup(pages: string[], sha = SHA) {
  const { db, sqlite } = testDb()
  sqlite
    .query(`INSERT INTO evaluation_origin (origin_id, evaluation_id, jurisdiction_code, fiscal_year, title, url, landing_url, sha256) VALUES (?,?,?,?,?,?,?,?)`)
    .run('o1', 'ev0', '131091', 2026, '評価シート', 'https://city.example.jp/a.pdf', null, SHA)
  addPages(sqlite, sha, pages)
  return { db, sqlite }
}

function addPages(sqlite: ReturnType<typeof testDb>['sqlite'], sha: string, pages: string[], truncated = false) {
  pages.forEach((text, i) =>
    sqlite.query(`INSERT INTO source_page_text (page_id, jurisdiction_code, sha256, page, text, truncated) VALUES (?,?,?,?,?,?)`)
      .run(`${sha}-${i + 1}`, '131091', sha, i + 1, text, truncated ? 1 : 0))
}

test('origin_id か sha256 で出典の頁の文字と公式の URL を返す', async () => {
  const { db } = setup(['1頁', '2頁の本文'])
  for (const origin of ['o1', SHA]) {
    expect(await readSourcePage(db, { origin, page: 2 })).toEqual({
      status: 'ok', origin_sha256: SHA, title: '評価シート', url: 'https://city.example.jp/a.pdf', page: 2, page_count: 2, text: '2頁の本文', truncated: false,
    })
  }
})

test('風土記の出典に無いもの・予算決算の出典は、頁の文字があっても返さない', async () => {
  const { db, sqlite } = setup(['x'])
  sqlite.query(`INSERT INTO expenditure_origin (origin_id, jurisdiction_code, fiscal_year, document_kind, title, url, format, sha256) VALUES (?,?,?,?,?,?,?,?)`)
    .run('x1', '131091', 2026, 'initial', '予算書', 'https://city.example.jp/x.pdf', 'pdf', OTHER)
  addPages(sqlite, OTHER, ['予算書の本文'])
  for (const origin of [OTHER, 'x1', '../fiscal/ingestion/x', `source-text/${SHA}.json`])
    expect((await readSourcePage(db, { origin, page: 1 })).status).toBe('not_found')
})

test('頁の範囲外と不正な入力は invalid、切った頁は truncated を返す', async () => {
  const { db, sqlite } = setup([])
  addPages(sqlite, SHA, ['切った本文'], true)
  expect((await readSourcePage(db, { origin: 'o1', page: 2 })).status).toBe('invalid')
  expect((await readSourcePage(db, { origin: 'o1', page: 0 })).status).toBe('invalid')
  expect((await readSourcePage(db, { origin: 'o1', page: 1, key: 'x' })).status).toBe('invalid')
  const r = await readSourcePage(db, { origin: 'o1', page: 1 })
  expect(r.status === 'ok' && [r.text, r.truncated]).toEqual(['切った本文', true])
})

test('文字の層の無い出典（行が無い）は unavailable', async () => {
  const { db } = setup([])
  expect((await readSourcePage(db, { origin: 'o1', page: 1 })).status).toBe('unavailable')
})

test('事業評価の出典は、Wayback Machine の写しでなく自治体の公式の頁を返す', async () => {
  const { db, sqlite } = setup([])
  sqlite
    .query(`INSERT INTO evaluation_origin (origin_id, evaluation_id, jurisdiction_code, fiscal_year, title, url, landing_url, sha256) VALUES (?,?,?,?,?,?,?,?)`)
    .run('e1', 'ev1', '131016', 2020, '評価', 'https://web.archive.org/web/2025id_/https://city.example.jp/r2.pdf', 'https://city.example.jp/r2.html', OTHER)
  addPages(sqlite, OTHER, ['本文'])
  for (const origin of [OTHER, 'e1']) {
    const r = await readSourcePage(db, { origin, page: 1 })
    expect(r.status === 'ok' && r.url).toBe('https://city.example.jp/r2.html')
  }
})

test('予算案のプレス発表の出典も origin_id か sha256 で引ける', async () => {
  const { db, sqlite } = setup([])
  sqlite
    .query(`INSERT INTO budget_proposal_origin (origin_id, budget_proposal_id, jurisdiction_code, fiscal_year, title, url, landing_url, sha256) VALUES (?,?,?,?,?,?,?,?)`)
    .run('p1', 'bp1', '131091', 2026, '予算案の概要', 'https://city.example.jp/p1.pdf', null, OTHER)
  addPages(sqlite, OTHER, ['本文'])
  for (const origin of [OTHER, 'p1']) {
    const r = await readSourcePage(db, { origin, page: 1 })
    expect(r.status === 'ok' && [r.title, r.url, r.text]).toEqual(['予算案の概要', 'https://city.example.jp/p1.pdf', '本文'])
  }
})

// 頁の文字は資料の文章そのものなので、公開の REST・MCP から読めないようにする。
// 公開か内部かは api のインターフェースだけが持つ（D1・columns.json には区別が無い）ので、表を読むモジュールを限って守る
test('頁の文字の表を読むのは内部の RPC（source-pages.ts）だけで、表の全部をなめるコードも無い', () => {
  const src = new URL('./', import.meta.url)
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== 'testing.ts' && !f.startsWith('gen/'))
  const readers = files.filter((f) => readFileSync(new URL(f, src), 'utf8').includes('source_page_text'))
  expect(readers).toEqual(['source-pages.ts'])
  const scans = files.filter((f) => /Object\.(keys|entries|values)\(\s*TABLES\s*\)|\bin TABLES\b/.test(readFileSync(new URL(f, src), 'utf8')))
  expect(scans).toEqual([])
})
