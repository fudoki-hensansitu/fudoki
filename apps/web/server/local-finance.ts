// 自治体の決算の指標（普通会計。市区町村は総務省「市町村別決算状況調」、都道府県は地方財政状況調査）。web の D1（fudoki-web の local_finance、scripts/sync-data/local_finance.py が入れる）から読む。
// D1 が無い（手元の試験）か読めないときは空で返し、頁は財政の状況の節を出さずに描く
import { dynamicTool, jsonSchema } from 'ai'
import { toolText } from '../tool-text'
import type { LocalFinance } from '../jurisdiction/types'
import type { Env } from './env'
import { logError } from './log'

const SQL =
  'SELECT fiscal_year, expenditure_total_yen, standard_fiscal_scale_yen, real_balance_yen, real_balance_ratio, current_balance_ratio, fiscal_capability_index, ' +
  'real_deficit_ratio, consolidated_real_deficit_ratio, real_debt_service_ratio, future_burden_ratio, personnel_yen, social_assistance_yen, debt_service_yen, ' +
  'local_bond_balance_yen, fund_balance_yen, fiscal_adjustment_fund_yen, debt_reduction_fund_yen, specified_purpose_fund_yen ' +
  'FROM local_finance WHERE jurisdiction_code = ? ORDER BY fiscal_year'

type Row = { [K in keyof typeof COLUMNS]: number | null } & { fiscal_year: number }
const COLUMNS = {
  expenditure_total_yen: 'expenditureTotal',
  standard_fiscal_scale_yen: 'standardFiscalScale',
  real_balance_yen: 'realBalance',
  real_balance_ratio: 'realBalanceRatio',
  current_balance_ratio: 'currentBalanceRatio',
  fiscal_capability_index: 'fiscalCapabilityIndex',
  real_deficit_ratio: 'realDeficitRatio',
  consolidated_real_deficit_ratio: 'consolidatedRealDeficitRatio',
  real_debt_service_ratio: 'realDebtServiceRatio',
  future_burden_ratio: 'futureBurdenRatio',
  personnel_yen: 'personnel',
  social_assistance_yen: 'socialAssistance',
  debt_service_yen: 'debtService',
  local_bond_balance_yen: 'localBondBalance',
  fund_balance_yen: 'fundBalance',
  fiscal_adjustment_fund_yen: 'fiscalAdjustmentFund',
  debt_reduction_fund_yen: 'debtReductionFund',
  specified_purpose_fund_yen: 'specifiedPurposeFund',
} as const satisfies Record<string, Exclude<keyof LocalFinance, 'year'>>

/** 自治体の決算の指標（年度の古い順）。都道府県は社会・人口統計体系にある年度だけで、基金などの列は null */
export async function loadLocalFinance(env: Env, code: string): Promise<LocalFinance[]> {
  const statement = env.DB?.prepare(SQL).bind(code)
  if (!statement?.all) return []
  try {
    const { results } = await statement.all<Row>()
    return results.map((r) => ({ year: r.fiscal_year, ...Object.fromEntries(Object.entries(COLUMNS).map(([column, key]) => [key, r[column as keyof typeof COLUMNS]])) }) as LocalFinance)
  } catch (e) {
    logError(e)
    return []
  }
}

export const LOCAL_FINANCE_TOOL = 'get_local_finance'

const DESCRIPTION =
  '自治体の普通会計の決算の指標（総務省の市町村別決算状況調・地方財政状況調査。頁の「財政」タブと同じもの）を年度ごとに返す。' +
  '歳出総額・標準財政規模・実質収支と実質収支比率・経常収支比率・財政力指数・健全化判断比率（実質赤字比率・連結実質赤字比率・実質公債費比率・将来負担比率）・' +
  '人件費・扶助費・公債費・地方債現在高（まちの借金）・積立金現在高（まちの貯金）と財政調整基金・減債基金・特定目的基金。' +
  '財政の状況・借金・貯金・財政の健全さを聞かれたときに使う。codes には6桁の自治体コード（list_jurisdictions の jurisdiction_code）を渡す。' +
  '_yen の列は円、_ratio の列は %、fiscal_capability_index は3年の平均の指数。null は統計に無い値。風土記の予算・決算の金額（一般会計・事業の単位）とは範囲が違い、合計が合わないことがある。'

/** アシスタントの tool。決算状況調は風土記の api ではなく web の D1 にあるので、api の tool とは別に足す */
export function localFinanceTool(env: Env) {
  return dynamicTool({
    description: DESCRIPTION,
    inputSchema: jsonSchema({
      type: 'object',
      properties: { codes: { type: 'array', items: { type: 'string', pattern: '^\\d{6}$' }, minItems: 1, maxItems: 10, description: '6桁の自治体コード' } },
      required: ['codes'],
      additionalProperties: false,
    }),
    execute: async (input) => {
      const codes = [...new Set((input as { codes: string[] }).codes)].filter((c) => /^\d{6}$/.test(c)).slice(0, 10)
      const out: Record<string, unknown> = {}
      for (const code of codes) {
        const rows = await loadLocalFinance(env, code)
        // 列の名前は D1 の列（単位が名前で分かる）にそろえる
        out[code] = rows.length
          ? rows.map((r) => ({ fiscal_year: r.year, ...Object.fromEntries(Object.entries(COLUMNS).map(([column, key]) => [column, r[key]])) }))
          : '決算の指標がありません'
      }
      return { content: [{ type: 'text', text: `決算の指標（普通会計、総務省）\n${JSON.stringify(out)}` }] }
    },
    toModelOutput: ({ output }) => ({ type: 'text', value: toolText(output) }),
  })
}
