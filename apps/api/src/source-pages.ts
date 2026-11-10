// 出典の1頁の文字を、非公開 R2 の `source-text/<sha256>.json`（pipeline の source_text.save が作る）から読む。
// HTTP の route・MCP には載せず、web のアシスタントが内部の RPC（source-pages-entrypoint.ts）から呼ぶだけ（docs/prd/source-reading/dd.md）。
// 出典の利用条件が無断の転載を禁じるため、本文は公開の REST・MCP には返さない。
import { z } from 'zod'
import { ORIGIN_TABLE } from './columns'
import type { Db } from './db'
import { CATALOG } from './evaluations'

/** R2 の binding のうち、ここで使う読み取りだけの型。書き込み・削除の関数を型に持たせない。 */
export interface SourceTextBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>
}

/** 1回に返す頁の文字の上限（Unicode の文字）。超えた分は切って truncated にする */
export const MAX_PAGE_CHARS = 8000

const SHA256 = /^[0-9a-f]{64}$/

export const sourcePageInput = z.strictObject({
  origin: z.string().min(1).max(256).describe('出典の sha256（64桁の16進）か origin_id'),
  page: z.number().int().min(1).max(100_000).describe('PDF の物理頁（1始まり）'),
})
export type SourcePageInput = z.infer<typeof sourcePageInput>

export type SourcePageResult =
  | { status: 'ok'; origin_sha256: string; title: string; url: string; page: number; page_count: number; text: string; truncated: boolean }
  | { status: 'invalid'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'unavailable'; message: string }

interface Origin { sha256: string; title: string; url: string }

const officialUrl = (url: string, landing: string) => (new URL(url).hostname === 'web.archive.org' ? landing : url)

async function resolveOrigin(db: Db, origin: string): Promise<Origin | null> {
  if (SHA256.test(origin)) {
    const row = await db.prepare(`SELECT title, url FROM ${ORIGIN_TABLE} WHERE sha256 = ? ORDER BY origin_id LIMIT 1`).bind(origin).first<{ title: string; url: string }>()
    if (row) return { sha256: origin, title: row.title, url: row.url }
    const doc = CATALOG.find((d) => d.origin_sha256 === origin)
    // catalog の url は自治体から消えた資料だと Wayback Machine の写しになる。利用者に示すのは自治体の公式の頁にする
    return doc ? { sha256: origin, title: doc.title, url: officialUrl(doc.url, doc.landing_url) } : null
  }
  const row = await db.prepare(`SELECT sha256, title, url FROM ${ORIGIN_TABLE} WHERE origin_id = ?`).bind(origin).first<{ sha256: string | null; title: string; url: string }>()
  return row?.sha256 && SHA256.test(row.sha256) ? { sha256: row.sha256, title: row.title, url: row.url } : null
}

/** 出典を風土記の出典の記録（D1 の expenditure_origin・評価資料の catalog）に照らしてから、R2 の key を sha256 から組み立てて読む。
 * 利用者や AI から R2 の key は受け取らない（取り込み表など他の object を読ませない）。 */
export async function readSourcePage(db: Db, bucket: SourceTextBucket | undefined, raw: unknown): Promise<SourcePageResult> {
  const parsed = sourcePageInput.safeParse(raw)
  if (!parsed.success) return { status: 'invalid', message: 'origin（sha256 か origin_id）と page（1以上の整数）を指定してください' }
  const { origin, page } = parsed.data
  if (!bucket) return { status: 'unavailable', message: '出典の文字を読めません' }
  const found = await resolveOrigin(db, origin)
  if (!found) return { status: 'not_found', message: '風土記の出典に無い origin です' }
  const object = await bucket.get(`source-text/${found.sha256}.json`)
  if (!object) return { status: 'unavailable', message: 'この出典の文字はまだ用意していません（文字の層の無い PDF・CSV を含む）。url の公式の資料を案内してください' }
  let pages: unknown
  try {
    pages = (JSON.parse(await object.text()) as { pages?: unknown }).pages
  } catch {
    pages = undefined
  }
  if (!Array.isArray(pages) || !pages.every((p) => typeof p === 'string')) return { status: 'unavailable', message: 'この出典の文字を読めません' }
  if (page > pages.length) return { status: 'invalid', message: `この出典は ${pages.length} 頁です` }
  const text = pages[page - 1] ?? ''
  const chars = [...text]
  return {
    status: 'ok', origin_sha256: found.sha256, title: found.title, url: found.url, page, page_count: pages.length,
    text: chars.length > MAX_PAGE_CHARS ? chars.slice(0, MAX_PAGE_CHARS).join('') : text,
    truncated: chars.length > MAX_PAGE_CHARS,
  }
}
