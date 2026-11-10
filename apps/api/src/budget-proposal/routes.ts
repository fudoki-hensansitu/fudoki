// 予算案の集約の REST。route は書き下ろし、型を AppType に載せる。
import { createRoute, z } from '@hono/zod-openapi'
import { getErrors, ok, postErrors, routes } from '../shared/http'
import { BudgetProposalId, BudgetProposalOutput, MeasureSearchOutput } from './model'
import { getBudgetProposal, searchMeasures } from './queries'
import { MEASURE_SEARCH_EXAMPLE, budgetProposalTools as t } from './tools'

const getRoute = createRoute({
  method: 'get',
  path: '/v1/budget-proposals/{budget_proposal_id}',
  operationId: t.get.name,
  summary: '予算案（自治体・予算の年度）を施策まで取得する',
  description: t.get.description,
  request: { params: z.strictObject({ budget_proposal_id: BudgetProposalId }) },
  responses: { ...ok(BudgetProposalOutput), ...getErrors },
})

const searchRoute = createRoute({
  method: 'post',
  path: '/v1/budget-proposals/measures:search',
  operationId: t.searchMeasures.name,
  summary: '予算案の施策を検索する',
  description: t.searchMeasures.description,
  request: { body: { required: true, content: { 'application/json': { schema: t.searchMeasures.input, example: MEASURE_SEARCH_EXAMPLE } } } },
  responses: { ...ok(MeasureSearchOutput), ...postErrors },
})

export const budgetProposalRoutes = routes()
  .openapi(searchRoute, async (c) => c.json(await searchMeasures(c.get('ctx'), c.req.valid('json')), 200))
  .openapi(getRoute, async (c) => c.json(await getBudgetProposal(c.get('ctx'), c.req.valid('param')), 200))
