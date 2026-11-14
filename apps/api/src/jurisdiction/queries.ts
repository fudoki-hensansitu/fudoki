// 自治体の集約の問い合わせ。自治体と収録範囲を1つの batch で読み、同期の入れ替えをまたいで食い違わないようにする。
import {
  BUDGET_PROPOSAL_TABLE,
  COVERAGE_TABLE,
  EVALUATION_TABLE,
  JURISDICTION_COLUMNS,
  JURISDICTION_SELECT_LIST,
  JURISDICTION_TABLE,
  ORIGIN_LINK_TABLE,
  ORIGIN_TABLE,
  toRow,
} from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { decodeToken, nextToken } from '../shared/paging'
import { AMOUNT_COLUMNS, COFOG_DIVISIONS, type Coverage, type CoverageWithOrigins, type JurisdictionDetail, type JurisdictionList, type SimilarInput, type SimilarList } from './model'

/**
 * 収録の無い自治体・年度・資料区分で、利用者を案内する統計の出典。数字は風土記に取り込まない（ADR 0037）。
 * 自治体が決算書を公開していない年度も、総務省の地方財政状況調査が普通会計の決算を款・項まで公開している。
 */
export const UNCOVERED_SOURCES = [
  {
    title: '市町村決算カード（総務省）',
    url: 'https://www.soumu.go.jp/iken/zaisei/card.html',
    description: '市町村ごとの普通会計の決算を、目的別（款）・性質別で1枚にまとめたもの。都道府県別の Excel。',
  },
  {
    title: '地方財政状況調査 市町村分 調査表（e-Stat）',
    url: 'https://www.e-stat.go.jp/stat-search/files?toukei=00200251&tstat=000001077755',
    description:
      '全市町村の普通会計の決算。表07〜13「歳出内訳及び財源内訳」が目的別の款・項（一部の款は項まで）を持つ。データセットの「調査年」は決算年度の翌年。',
  },
]

export const MAX_JURISDICTION_PAGE_SIZE = 100
export const DEFAULT_JURISDICTION_PAGE_SIZE = 20

interface CoverageRow extends Record<string, unknown> {
  jurisdiction_code: string
  fiscal_year: number
  document_kind: string
  account_name: string
  account_kind: string
  origin_id?: string
  title?: string
  url?: string
  format?: string
}

/** 自治体コード順に並んだ行を、自治体 → 年度・資料区分 → 会計（→ 出典）の入れ子にする（行の順を保つ）。 */
function nestCoverage(rows: CoverageRow[], withOrigins: boolean) {
  const out = new Map<string, CoverageWithOrigins[]>()
  for (const r of rows) {
    const list = out.get(r.jurisdiction_code) ?? []
    out.set(r.jurisdiction_code, list)
    let cov = list.at(-1)
    if (!cov || cov.fiscal_year !== r.fiscal_year || cov.document_kind !== r.document_kind) {
      cov = { fiscal_year: r.fiscal_year, document_kind: r.document_kind as Coverage['document_kind'], accounts: [] }
      list.push(cov)
    }
    let account = cov.accounts.at(-1)
    if (!account || account.account_name !== r.account_name) {
      account = { account_name: r.account_name, account_kind: r.account_kind, ...amountsOf(r), origins: [] }
      cov.accounts.push(account)
    }
    if (withOrigins) account.origins.push({ origin_id: r.origin_id!, title: r.title!, url: r.url!, format: r.format! })
  }
  return out
}

const amountsOf = (r: CoverageRow) => Object.fromEntries(AMOUNT_COLUMNS.map((c) => [c, (r[c] as number | null) ?? null])) as Omit<Coverage['accounts'][number], 'account_name' | 'account_kind'>
const AMOUNT_SELECT = AMOUNT_COLUMNS.map((c) => `c."${c}"`).join(', ')

const coverageSql = (codes: string, withOrigins: boolean) =>
  withOrigins
    ? `SELECT c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_name", c."account_kind", ${AMOUNT_SELECT}, o."origin_id", o."title", o."url", o."format" ` +
      `FROM ${COVERAGE_TABLE} c JOIN ${ORIGIN_LINK_TABLE} l ON l."expenditure_id" = c."expenditure_id" ` +
      `JOIN ${ORIGIN_TABLE} o ON o."origin_id" = l."origin_id" ` +
      `WHERE c."jurisdiction_code" IN (${codes}) ` +
      `ORDER BY c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_kind" <> '一般会計', c."account_name", o."title", o."origin_id"`
    : `SELECT DISTINCT c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_name", c."account_kind", ${AMOUNT_SELECT} ` +
      `FROM ${COVERAGE_TABLE} c WHERE c."jurisdiction_code" IN (${codes}) ` +
      `ORDER BY c."jurisdiction_code", c."fiscal_year", c."document_kind", c."account_kind" <> '一般会計', c."account_name"`

const yearsSql = (codes: string) =>
  `SELECT "jurisdiction_code", 'evaluation' AS "kind", "evaluation_id" AS "id", "fiscal_year" FROM ${EVALUATION_TABLE} WHERE "jurisdiction_code" IN (${codes}) ` +
  `UNION ALL SELECT "jurisdiction_code", 'budget_proposal', "budget_proposal_id", "fiscal_year" FROM ${BUDGET_PROPOSAL_TABLE} WHERE "jurisdiction_code" IN (${codes}) ` +
  `ORDER BY 1, 2, 4`

type YearRow = { jurisdiction_code: string; kind: 'evaluation' | 'budget_proposal'; id: string; fiscal_year: number }

function groupYears(rows: YearRow[]) {
  type Refs = { evaluations: { evaluation_id: string; fiscal_year: number }[]; budget_proposals: { budget_proposal_id: string; fiscal_year: number }[] }
  const out = new Map<string, Refs>()
  for (const r of rows) {
    const y = out.get(r.jurisdiction_code) ?? { evaluations: [], budget_proposals: [] }
    out.set(r.jurisdiction_code, y)
    if (r.kind === 'evaluation') y.evaluations.push({ evaluation_id: r.id, fiscal_year: r.fiscal_year })
    else y.budget_proposals.push({ budget_proposal_id: r.id, fiscal_year: r.fiscal_year })
  }
  return out
}

export interface ListInput {
  name?: string
  code?: string
  page_size?: number
  page_token?: string
}

export async function listJurisdictions(ctx: Ctx, input: ListInput): Promise<JurisdictionList> {
  const { db } = ctx
  const name = input.name?.normalize('NFKC').trim() || undefined
  const code = input.code
  const limit = input.page_size ?? DEFAULT_JURISDICTION_PAGE_SIZE
  const conds: string[] = []
  const params: string[] = []
  if (name !== undefined) {
    conds.push('instr("name", ?) > 0')
    params.push(name)
  }
  if (code !== undefined) {
    // 5桁は検査数字を除いた同じコード。検査数字は先頭5桁で決まるので、先頭5桁の一致で一つに決まる
    conds.push(code.length === 5 ? 'substr("jurisdiction_code", 1, 5) = ?' : '"jurisdiction_code" = ?')
    params.push(code)
  }
  const where = conds.length > 0 ? conds.join(' AND ') : '1 = 1'
  const fp = ['jurisdictions', name ?? null, code ?? null]
  const offset = await decodeToken(input.page_token, fp)
  const pageSql = `SELECT "jurisdiction_code" FROM ${JURISDICTION_TABLE} WHERE ${where} ORDER BY "jurisdiction_code" LIMIT ? OFFSET ?`
  const pageParams = [...params, limit, offset]
  const [page, coverage, years] = await db.batch([
    db.prepare(`SELECT ${JURISDICTION_SELECT_LIST} FROM ${JURISDICTION_TABLE} WHERE ${where} ORDER BY "jurisdiction_code" LIMIT ? OFFSET ?`).bind(...params, limit + 1, offset),
    db.prepare(coverageSql(pageSql, false)).bind(...pageParams),
    db.prepare(yearsSql(pageSql)).bind(...pageParams, ...pageParams),
  ])
  const more = page!.results.length > limit
  const nested = nestCoverage(coverage!.results as unknown as CoverageRow[], false)
  const yearsOf = groupYears(years!.results as unknown as YearRow[])
  return {
    jurisdictions: page!.results.slice(0, limit).map((r) => {
      const code = String(r.jurisdiction_code)
      return {
        ...toRow(JURISDICTION_COLUMNS, r),
        coverage: (nested.get(code) ?? []).map((c) => ({ ...c, accounts: c.accounts.map(({ origins: _, ...a }) => a) })),
        evaluations: yearsOf.get(code)?.evaluations ?? [],
        budget_proposals: yearsOf.get(code)?.budget_proposals ?? [],
      } as JurisdictionList['jurisdictions'][number]
    }),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    uncovered_sources: UNCOVERED_SOURCES,
  }
}

export async function getJurisdiction(ctx: Ctx, code: string): Promise<JurisdictionDetail> {
  const { db } = ctx
  const one = '?'
  const [self, coverage, years] = await db.batch([
    db.prepare(`SELECT ${JURISDICTION_SELECT_LIST} FROM ${JURISDICTION_TABLE} WHERE "jurisdiction_code" = ?`).bind(code),
    db.prepare(coverageSql(one, true)).bind(code),
    db.prepare(yearsSql(one)).bind(code, code),
  ])
  const raw = self!.results[0]
  if (!raw) throw new ApiError(404, 'NOT_FOUND', `自治体が見つかりません: ${code}`)
  const y = groupYears(years!.results as unknown as YearRow[]).get(code)
  return {
    ...toRow(JURISDICTION_COLUMNS, raw),
    coverage: nestCoverage(coverage!.results as unknown as CoverageRow[], true).get(code) ?? [],
    evaluations: y?.evaluations ?? [],
    budget_proposals: y?.budget_proposals ?? [],
    uncovered_sources: UNCOVERED_SOURCES,
  } as JurisdictionDetail
}

const SHARE_COLUMNS = [...COFOG_DIVISIONS.map((d) => `cofog_${d}_yen`), 'cofog_unclassified_yen']
const shareDistance = SHARE_COLUMNS.map((c) => `abs(c."${c}" * 1.0 / c."total_yen" - me."${c}" * 1.0 / me."total_yen")`).join(' + ')

/** 分野の割合が近い自治体。比べるのは同じ年度・資料区分の一般会計どうしで、D1 の中で並べて上位だけを返す */
export async function similarJurisdictions(ctx: Ctx, input: SimilarInput): Promise<SimilarList> {
  const among = input.among ? `AND c."jurisdiction_code" IN (SELECT value FROM json_each(?))` : ''
  const sql =
    `WITH me AS (SELECT * FROM ${COVERAGE_TABLE} WHERE "jurisdiction_code" = ? AND "fiscal_year" = ? AND "document_kind" = ? AND "account_kind" = '一般会計' AND "total_yen" > 0 LIMIT 1) ` +
    `SELECT c."jurisdiction_code", j."name", c."total_yen" FROM ${COVERAGE_TABLE} c ` +
    `JOIN me ON c."fiscal_year" = me."fiscal_year" AND c."document_kind" = me."document_kind" ` +
    `JOIN ${JURISDICTION_TABLE} j ON j."jurisdiction_code" = c."jurisdiction_code" ` +
    `WHERE c."account_kind" = '一般会計' AND c."total_yen" > 0 AND c."jurisdiction_code" <> me."jurisdiction_code" ` +
    `AND (substr(c."jurisdiction_code", 3, 3) = '000') = (substr(me."jurisdiction_code", 3, 3) = '000') ${among} ` +
    `ORDER BY ${shareDistance}, c."jurisdiction_code" LIMIT ?`
  const params: unknown[] = [input.jurisdiction_code, input.fiscal_year, input.document_kind, ...(input.among ? [JSON.stringify(input.among)] : []), input.limit]
  const { results } = await ctx.db.prepare(sql).bind(...params).all<SimilarList['jurisdictions'][number]>()
  return { jurisdictions: results }
}
