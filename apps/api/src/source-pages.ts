// 出典の1頁の文字を、D1 の表 source_page_text（pipeline の marts、docs/prd/page-words/dd.md）から読む。
// HTTP の route・MCP には載せず、web のアシスタントが内部の RPC（source-pages-entrypoint.ts）から呼ぶだけ。
// 出典の利用条件が無断の転載を禁じるため、本文は公開の REST・MCP には返さない。この表を読むモジュールはここだけにする（source-pages.test.ts）。
import { z } from 'zod'
import { BUDGET_PROPOSAL_ORIGIN_TABLE, EVALUATION_ORIGIN_TABLE } from './columns'
import type { Db } from './db'

/** 頁の文字の表。公開の route・tool から読まないよう、表名は columns.ts に置かずここに書く */
const PAGE_TEXT_TABLE = 'source_page_text'

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

// 頁の文字があるのは事業評価・予算案の出典だけ（予算・決算は金額と説明欄を表にしてあるので作らない）。
// url は自治体から消えた資料だと Wayback Machine の写しになるので、landing_url（自治体の公式の頁）も引く
const ORIGINS =
  `SELECT "origin_id", "sha256", "title", "url", "landing_url" FROM ${EVALUATION_ORIGIN_TABLE} ` +
  `UNION ALL SELECT "origin_id", "sha256", "title", "url", "landing_url" FROM ${BUDGET_PROPOSAL_ORIGIN_TABLE}`

type OriginRecord = { sha256: string | null; title: string | null; url: string; landing_url: string | null }

/** 利用者に示す URL。Wayback Machine の写しなら自治体の公式の頁にする */
const officialUrl = (r: OriginRecord) => (r.landing_url && new URL(r.url).hostname === 'web.archive.org' ? r.landing_url : r.url)

async function resolveOrigin(db: Db, origin: string): Promise<Origin | null> {
  const column = SHA256.test(origin) ? 'sha256' : 'origin_id'
  const row = await db.prepare(`SELECT "sha256", "title", "url", "landing_url" FROM (${ORIGINS}) WHERE "${column}" = ? ORDER BY "origin_id" LIMIT 1`).bind(origin).first<OriginRecord>()
  return row?.sha256 && SHA256.test(row.sha256) ? { sha256: row.sha256, title: row.title ?? '', url: officialUrl(row) } : null
}

/** 出典を風土記の出典の記録（D1 の事業評価・予算案の出典の表）に照らしてから、その sha256 の頁を読む。
 * 本文は pipeline が 12,000字で切ってあり、truncated は表の列をそのまま返す。 */
export async function readSourcePage(db: Db, raw: unknown): Promise<SourcePageResult> {
  const parsed = sourcePageInput.safeParse(raw)
  if (!parsed.success) return { status: 'invalid', message: 'origin（sha256 か origin_id）と page（1以上の整数）を指定してください' }
  const { origin, page } = parsed.data
  const found = await resolveOrigin(db, origin)
  if (!found) return { status: 'not_found', message: '風土記の出典に無い origin です' }
  // 文字のある出典は全頁の行があるので、頁数は最後の頁。文字の層の無い出典（スキャン）は行が無い
  const count = await db.prepare(`SELECT MAX("page") AS "page_count" FROM ${PAGE_TEXT_TABLE} WHERE "sha256" = ?`).bind(found.sha256).first<{ page_count: number | null }>()
  const pageCount = count?.page_count ?? 0
  if (!pageCount) return { status: 'unavailable', message: 'この出典の文字はありません（文字の層の無い PDF を含む）。url の公式の資料を案内してください' }
  if (page > pageCount) return { status: 'invalid', message: `この出典は ${pageCount} 頁です` }
  const row = await db.prepare(`SELECT "text", "truncated" FROM ${PAGE_TEXT_TABLE} WHERE "sha256" = ? AND "page" = ?`).bind(found.sha256, page).first<{ text: string; truncated: number }>()
  return {
    status: 'ok', origin_sha256: found.sha256, title: found.title, url: found.url, page, page_count: pageCount,
    text: row?.text ?? '', truncated: Boolean(row?.truncated),
  }
}
