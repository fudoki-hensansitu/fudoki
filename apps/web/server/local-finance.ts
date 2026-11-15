// 市町村の決算の指標（総務省「市町村別決算状況調」の普通会計）。web の D1（fudoki-web の local_finance、scripts/sync-data/local_finance.py が入れる）から読む。
// D1 が無い（手元の試験）か読めないときは空で返し、頁は財政の状況の節を出さずに描く
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

/** 自治体の決算の指標（年度の古い順）。都道府県は決算状況調に載らないので空 */
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
