// 住民基本台帳人口。web の D1（fudoki-web の population、scripts/sync-data/population.py が Queria から入れる）から読む。
// D1 が無い（preview・手元の試験）か読めないときは空で返し、頁は人口と1人あたりの額を出さずに描く
import { dynamicTool, jsonSchema } from 'ai'
import type { Population } from '../jurisdiction/types'
import type { Env } from './env'
import { logError } from './log'

const SQL =
  'SELECT jurisdiction_code, reference_date, population FROM population ' +
  'WHERE jurisdiction_code IN (SELECT value FROM json_each(?)) ORDER BY jurisdiction_code, reference_date'

/** 自治体コードごとの人口（基準日の古い順） */
export async function loadPopulations(env: Env, codes: string[]): Promise<Map<string, Population[]>> {
  const out = new Map<string, Population[]>()
  const statement = env.DB?.prepare(SQL).bind(JSON.stringify(codes))
  if (!statement?.all || codes.length === 0) return out
  try {
    const { results } = await statement.all<{ jurisdiction_code: string; reference_date: string; population: number }>()
    for (const r of results) out.set(r.jurisdiction_code, [...(out.get(r.jurisdiction_code) ?? []), { people: r.population, asOf: r.reference_date }])
  } catch (e) {
    logError(e)
  }
  return out
}

export const POPULATION_TOOL = 'get_population'

const DESCRIPTION =
  '自治体の住民基本台帳人口（総務省の集計の総計。毎年1月1日時点）を、基準日ごとに返す。' +
  '1人あたりの金額を出すとき、人口を聞かれたときに使う。codes には6桁の自治体コード（list_jurisdictions の jurisdiction_code）を渡す。' +
  'N 年度の金額と比べるときは、N+1 年1月1日の人口を使い、まだ無ければいちばん新しい基準日の人口を使って、そのことを添える。'

/** アシスタントの tool。人口は風土記の api ではなく web の D1 にあるので、MCP の tool とは別に足す */
export function populationTool(env: Env) {
  return dynamicTool({
    description: DESCRIPTION,
    inputSchema: jsonSchema({
      type: 'object',
      properties: { codes: { type: 'array', items: { type: 'string', pattern: '^\\d{6}$' }, minItems: 1, maxItems: 20, description: '6桁の自治体コード' } },
      required: ['codes'],
      additionalProperties: false,
    }),
    execute: async (input) => {
      const codes = [...new Set((input as { codes: string[] }).codes)].filter((c) => /^\d{6}$/.test(c)).slice(0, 20)
      const found = await loadPopulations(env, codes)
      const lines = codes.map((c) => {
        const list = found.get(c)
        return list?.length ? `${c}: ${list.map((p) => `${p.asOf} ${p.people.toLocaleString('ja-JP')}人`).join('、')}` : `${c}: 人口がありません`
      })
      return { content: [{ type: 'text', text: `住民基本台帳人口（総務省）\n${lines.join('\n')}` }] }
    },
  })
}
