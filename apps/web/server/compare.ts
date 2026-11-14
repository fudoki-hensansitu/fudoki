// まち比べ（/compare）の似たまち。全部のまちを読まず、近い順の上位だけを api（分野の割合）と web の D1（人口）に聞く
import type { DocumentKind } from './jurisdiction'
import type { Env } from './env'
import { apiCall } from './fudoki-api'
import { logError } from './log'
import { loadPopulations } from './population'

export type TownRef = { code: string; name: string; pop: number }

// 人口の近い順に、この数のまちを api に渡して収録のあるまちだけに絞る
const POPULATION_CANDIDATES = 100
const POPULATION_SQL =
  'WITH latest AS (SELECT jurisdiction_code, population FROM population p WHERE reference_date = (SELECT max(reference_date) FROM population q WHERE q.jurisdiction_code = p.jurisdiction_code)) ' +
  "SELECT jurisdiction_code FROM latest WHERE jurisdiction_code <> ?1 AND population > 0 AND (substr(jurisdiction_code, 3, 3) = '000') = (substr(?1, 3, 3) = '000') " +
  'ORDER BY max(population, ?2) * 1.0 / min(population, ?2), jurisdiction_code LIMIT ?3'

/** 人口の比（何倍か）で近い順 */
const byRatio = (pop: number) => (x: TownRef, y: TownRef) => Math.max(x.pop, pop) / Math.min(x.pop, pop) - Math.max(y.pop, pop) / Math.min(y.pop, pop)

/** a に似たまち。byUse は同じ年度・資料の一般会計で分野の割合が近い順、byPopulation は人口が近い順。どちらも同じ資料の収録があるまちだけ。読めなければ空 */
export async function similarTowns(env: Env, a: { code: string; pop: number }, year: number, kind: DocumentKind, n: number): Promise<{ byUse: TownRef[]; byPopulation: TownRef[] }> {
  const api = apiCall(env)
  const query = { jurisdiction_code: a.code, fiscal_year: year, document_kind: kind }
  const withPop = async (rows: { jurisdiction_code: string; name: string }[]): Promise<TownRef[]> => {
    const pops = await loadPopulations(env, rows.map((r) => r.jurisdiction_code))
    return rows.map((r) => ({ code: r.jurisdiction_code, name: r.name, pop: pops.get(r.jurisdiction_code)?.at(-1)?.people ?? 0 }))
  }
  const useOf = async () => withPop((await api('list_similar_jurisdictions', { ...query, limit: n })).jurisdictions)
  const populationOf = async () => {
    // D1 が無い（preview・手元の試験）ときは探さない
    const statement = env.DB?.prepare(POPULATION_SQL).bind(a.code, a.pop, POPULATION_CANDIDATES)
    if (!a.pop || !statement?.all) return []
    const { results } = await statement.all<{ jurisdiction_code: string }>()
    if (!results.length) return []
    const covered = await api('list_similar_jurisdictions', { ...query, among: results.map((r) => r.jurisdiction_code), limit: POPULATION_CANDIDATES })
    return (await withPop(covered.jurisdictions)).filter((t) => t.pop > 0).sort(byRatio(a.pop)).slice(0, n)
  }
  const safe = (p: Promise<TownRef[]>) => p.catch((e) => (logError(e), [] as TownRef[]))
  const [byUse, byPopulation] = await Promise.all([safe(useOf()), safe(populationOf())])
  return { byUse, byPopulation }
}
