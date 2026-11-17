// まち比べ（/compare）の分野の額。api の歳出の集約（list_expenditures）から、資料ごとの一般会計の総額と分野の額を引く
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import type { DocumentKind } from './jurisdiction'
import type { Env } from './env'
import { apiCall, type WebOpOutput } from './fudoki-api'

/** 総額と、分野（DOMAIN_FRAMES の id。分類できないものは other）ごとの額 */
export type FieldTotals = { total: number; fields: Record<string, number> }
export type CompareVersion = { code: string; year: number; kind: DocumentKind }

type Totals = WebOpOutput<'list_expenditures'>['expenditures'][number]
const DIVISIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const
const ACCOUNT = '一般会計'
const keyOf = (v: CompareVersion) => `${v.code}:${v.year}:${v.kind}`

/** 歳出の根の額を分野ごとの額にする。総額の無い（科目の表の無い）根は undefined */
function fieldTotalsOf(t: Totals): FieldTotals | undefined {
  if (t.total_yen == null || !(t.total_yen > 0)) return undefined
  const fields: Record<string, number> = {}
  const add = (id: string, yen: number | null) => yen && (fields[id] = (fields[id] ?? 0) + yen)
  for (const d of DIVISIONS) add((frameOf(d) ?? OTHER_FRAME).id, t[`cofog_${d}_yen`])
  add(OTHER_FRAME.id, t.cofog_unclassified_yen)
  return { total: t.total_yen, fields }
}

/** 比べる資料ごとの一般会計の総額と分野の額（歳出の集約から1回で引く）。額の無い資料は入らない */
export async function loadFieldTotals(env: Env, versions: CompareVersion[]): Promise<(v: CompareVersion) => FieldTotals | undefined> {
  const { expenditures } = await apiCall(env)('list_expenditures', { versions: versions.map((v) => ({ jurisdiction_code: v.code, fiscal_year: v.year, document_kind: v.kind })) })
  const out = new Map<string, FieldTotals>()
  for (const e of expenditures) {
    const t = e.account_name === ACCOUNT ? fieldTotalsOf(e) : undefined
    if (t) out.set(keyOf({ code: e.jurisdiction_code, year: e.fiscal_year, kind: e.document_kind }), t)
  }
  return (v) => out.get(keyOf(v))
}
