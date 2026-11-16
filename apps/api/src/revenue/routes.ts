// 歳入の集約の REST。route は書き下ろし、型を AppType に載せる。
import { createRoute } from '@hono/zod-openapi'
import { getErrors, ok, routes } from '../shared/http'
import { RevenueOutput, RevenueQuery } from './model'
import { getRevenue } from './queries'
import { revenueTools as t } from './tools'

const getRevenueRoute = createRoute({
  method: 'get',
  path: '/v1/revenues',
  operationId: t.get.name,
  summary: '自治体の歳入（款）を取得する',
  description: t.get.description,
  request: { query: RevenueQuery },
  responses: { ...ok(RevenueOutput), ...getErrors },
})

export const revenueRoutes = routes().openapi(getRevenueRoute, async (c) => c.json(await getRevenue(c.get('ctx'), c.req.valid('query')), 200))
