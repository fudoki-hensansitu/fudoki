// まち比べ（/compare・/compare/<問い>）の値。東京都の市区町村（島しょを含む）について、全部の問いの値を一度に組む。
// 決算状況調（web の D1 の local_finance）と人口（population）は1回の SELECT ずつ、分野の額は api の list_expenditures にまとめて聞く。
// 頁は CDN（ISR）に置くので、ここを通るのは1時間に1回ほど
import { PREFECTURE_MAPS } from '../jurisdiction/map.generated'
import { jurisdictionPath } from '../jurisdiction/path'
import { FIELD_OF_QUESTION, QUESTIONS } from '../compare/questions'
import { loadFieldTotals, type FieldTotals } from './compare'
import type { Env } from './env'
import { logError } from './log'
import { loadPopulations } from './population'

export type MapTown = {
  code: string
  name: string
  path: string
  /** タイルの列・行。島しょは本土の下の段に並べる */
  col: number
  row: number
  pop: number | null
  /** 問いの slug ごとの値。無いもの（未収録）は null */
  values: Record<string, number | null>
}
export type CompareMap = { prefecture: string; cols: number; rows: number; year: number | null; towns: MapTown[] }

const PREFECTURE = PREFECTURE_MAPS.find((m) => m.code === '13')!

const FINANCE_SQL =
  'SELECT jurisdiction_code, fiscal_year, expenditure_total_yen, local_bond_balance_yen, fund_balance_yen, current_balance_ratio, real_balance_yen FROM local_finance ' +
  'WHERE jurisdiction_code IN (SELECT value FROM json_each(?1)) AND fiscal_year = (SELECT max(fiscal_year) FROM local_finance WHERE jurisdiction_code IN (SELECT value FROM json_each(?1)))'
type FinanceRow = { jurisdiction_code: string; fiscal_year: number; expenditure_total_yen: number | null; local_bond_balance_yen: number | null; fund_balance_yen: number | null; current_balance_ratio: number | null; real_balance_yen: number | null }

// list_expenditures は1回に10資料まで
const VERSIONS_PER_CALL = 10

async function loadFinance(env: Env, codes: string[]): Promise<FinanceRow[]> {
  const statement = env.DB?.prepare(FINANCE_SQL).bind(JSON.stringify(codes))
  if (!statement?.all) return []
  try {
    return (await statement.all<FinanceRow>()).results
  } catch (e) {
    logError(e)
    return []
  }
}

/** year 年度の決算（一般会計）の分野の額。読めない資料は入らない */
async function loadFields(env: Env, codes: string[], year: number): Promise<Map<string, FieldTotals>> {
  const out = new Map<string, FieldTotals>()
  const chunks = Array.from({ length: Math.ceil(codes.length / VERSIONS_PER_CALL) }, (_, i) => codes.slice(i * VERSIONS_PER_CALL, (i + 1) * VERSIONS_PER_CALL))
  await Promise.all(
    chunks.map(async (chunk) => {
      const versions = chunk.map((code) => ({ code, year, kind: 'settlement' as const }))
      const totalsOf = await loadFieldTotals(env, versions).catch((e) => (logError(e), () => undefined))
      for (const v of versions) {
        const t = totalsOf(v)
        if (t) out.set(v.code, t)
      }
    }),
  )
  return out
}

const per = (yen: number | null | undefined, pop: number | null) => (yen == null || !pop ? null : yen / pop)

/** 分野の割合（%）。分野に分けていない（全部「その他」の）資料は割合を出せないので null */
function share(t: FieldTotals | undefined, field: string): number | null {
  if (!t || !t.total || Object.keys(t.fields).every((id) => id === 'other')) return null
  return ((t.fields[field] ?? 0) / t.total) * 100
}

export async function loadCompareMap(env: Env): Promise<CompareMap> {
  const mainland = PREFECTURE.tiles.map((t) => ({ code: t.code, name: t.name, col: t.col, row: t.row }))
  // 島しょは本土と離れすぎるので、本土の下に1段空けて西から並べる
  const islands = PREFECTURE.islands.map((t, i) => ({ code: t.code, name: t.name, col: i, row: PREFECTURE.rows + 1 }))
  const tiles = [...mainland, ...islands]
  const codes = tiles.map((t) => t.code)
  const [finance, populations] = await Promise.all([loadFinance(env, codes), loadPopulations(env, codes)])
  const year = finance[0]?.fiscal_year ?? null
  const fields = year ? await loadFields(env, codes, year) : new Map<string, FieldTotals>()
  const financeOf = new Map(finance.map((r) => [r.jurisdiction_code, r]))
  // N 年度の額には N+1 年1月1日の人口を使い、無ければいちばん新しい人口
  const asOf = year ? `${year + 1}-01-01` : ''
  const towns = tiles.map((t): MapTown => {
    const list = populations.get(t.code) ?? []
    const pop = (list.find((p) => p.asOf === asOf) ?? list.at(-1))?.people ?? null
    const f = financeOf.get(t.code)
    const totals = fields.get(t.code)
    const finance: Record<string, number | null> = {
      'spending-per-person': per(f?.expenditure_total_yen, pop),
      'debt-per-person': per(f?.local_bond_balance_yen, pop),
      'savings-per-person': per(f?.fund_balance_yen, pop),
      'fixed-cost-ratio': f?.current_balance_ratio ?? null,
      'surplus-per-person': per(f?.real_balance_yen, pop),
    }
    const values = Object.fromEntries(QUESTIONS.map((q) => [q.slug, q.source === 'fiscal' ? share(totals, FIELD_OF_QUESTION[q.slug]!) : (finance[q.slug] ?? null)]))
    return { ...t, path: jurisdictionPath(t.code), pop, values }
  })
  return { prefecture: PREFECTURE.name, cols: PREFECTURE.cols, rows: PREFECTURE.rows + (islands.length ? 2 : 0), year, towns }
}
