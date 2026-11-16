// 歳入の集約の REST。route は書き下ろし、型を AppType に載せる。
import { createRoute, z } from '@hono/zod-openapi'
import { getErrors, ok, postErrors, routes } from '../shared/http'
import { RevenueLineId, RevenueLineOutput, RevenueOutput, RevenueQuery, RevenueSubjectSearchOutput } from './model'
import { getRevenue, getRevenueLine, searchRevenueSubjects } from './queries'
import { REVENUE_SUBJECT_SEARCH_EXAMPLE, revenueTools as t } from './tools'

const getRevenueRoute = createRoute({
  method: 'get',
  path: '/v1/revenues',
  operationId: t.get.name,
  summary: '自治体の歳入（款）を取得する',
  description: t.get.description,
  request: { query: RevenueQuery },
  responses: { ...ok(RevenueOutput), ...getErrors },
})

const searchSubjectsRoute = createRoute({
  method: 'post',
  path: '/v1/revenues/subjects:search',
  operationId: t.searchSubjects.name,
  summary: '歳入の科目（款・項・目）を検索する',
  description: t.searchSubjects.description,
  request: { body: { required: true, content: { 'application/json': { schema: t.searchSubjects.input, example: REVENUE_SUBJECT_SEARCH_EXAMPLE } } } },
  responses: { ...ok(RevenueSubjectSearchOutput), ...postErrors },
})

const getLineRoute = createRoute({
  method: 'get',
  path: '/v1/revenues/lines/{line_id}',
  operationId: t.getLine.name,
  summary: '歳入の科目と、その子の科目を取得する',
  description: t.getLine.description,
  request: { params: z.strictObject({ line_id: RevenueLineId }) },
  responses: { ...ok(RevenueLineOutput), ...getErrors },
})

export const revenueRoutes = routes()
  .openapi(getRevenueRoute, async (c) => c.json(await getRevenue(c.get('ctx'), c.req.valid('query')), 200))
  .openapi(searchSubjectsRoute, async (c) => c.json(await searchRevenueSubjects(c.get('ctx'), c.req.valid('json')), 200))
  .openapi(getLineRoute, async (c) => c.json(await getRevenueLine(c.get('ctx'), c.req.valid('param')), 200))
