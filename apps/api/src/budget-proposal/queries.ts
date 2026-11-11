// 予算案の集約の問い合わせ。根・施策・出典は1つの batch（トランザクション）で読む。
import { BUDGET_MEASURE_TABLE, BUDGET_PROPOSAL_ORIGIN_TABLE, BUDGET_PROPOSAL_TABLE, columnsOf, selectListOf, toRow } from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { searchRows } from '../shared/query'
import type { SearchInput } from '../shared/search'
import { MAX_MEASURES, type BudgetProposalOutput, type MeasureSearchOutput } from './model'

const ORIGIN = { table: BUDGET_PROPOSAL_ORIGIN_TABLE, selectList: selectListOf(BUDGET_PROPOSAL_ORIGIN_TABLE) }
const M = BUDGET_MEASURE_TABLE

/** 予算案の根と、その施策・プレス発表の資料 */
export async function getBudgetProposal(ctx: Ctx, input: { budget_proposal_id: string }): Promise<BudgetProposalOutput> {
  const { db } = ctx
  const id = input.budget_proposal_id
  const [root, measures, origins] = await db.batch([
    db.prepare(`SELECT ${selectListOf(BUDGET_PROPOSAL_TABLE)} FROM ${BUDGET_PROPOSAL_TABLE} WHERE "budget_proposal_id" = ?`).bind(id),
    db.prepare(`SELECT ${M.selectList} FROM ${M.table} WHERE "budget_proposal_id" = ? ORDER BY "origin_id", "page", "position" LIMIT ?`).bind(id, MAX_MEASURES),
    db.prepare(`SELECT ${ORIGIN.selectList} FROM ${ORIGIN.table} WHERE "budget_proposal_id" = ? ORDER BY "origin_id"`).bind(id),
  ])
  const r = root!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `予算案が見つかりません: ${id}`)
  return {
    budget_proposal: toRow(columnsOf(BUDGET_PROPOSAL_TABLE), r),
    measures: measures!.results.map((m) => toRow(M.columns, m)),
    origins: origins!.results.map((o) => toRow(columnsOf(ORIGIN.table), o)),
  } as BudgetProposalOutput
}

export async function searchMeasures(ctx: Ctx, input: SearchInput): Promise<MeasureSearchOutput> {
  const { rows: measures, ...rest } = await searchRows(M, ORIGIN, ctx, input)
  return { measures, ...rest } as MeasureSearchOutput
}
