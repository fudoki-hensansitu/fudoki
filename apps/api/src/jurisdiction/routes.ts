// 自治体の集約の REST。route は書き下ろし、型を AppType に載せる（web が Hono RPC で呼ぶ）。
import { createRoute, z } from '@hono/zod-openapi'
import { JurisdictionCode } from '../shared/model'
import { getErrors, ok, routes } from '../shared/http'
import { JurisdictionDetail, JurisdictionList } from './model'
import { getJurisdiction, listJurisdictions } from './queries'
import { ListQuerySchema, jurisdictionTools as t } from './tools'

const listRoute = createRoute({
  method: 'get',
  path: '/v1/jurisdictions',
  operationId: t.list.name,
  summary: '自治体と収録範囲の一覧',
  description: t.list.description,
  request: { query: ListQuerySchema },
  responses: { ...ok(JurisdictionList), ...getErrors },
})

const getRoute = createRoute({
  method: 'get',
  path: '/v1/jurisdictions/{jurisdiction_code}',
  operationId: 'get_jurisdiction',
  summary: '自治体と、収録範囲の出典を取得する',
  description:
    'Return one municipality by its six-digit code with expenditure coverage with the source documents of each account, project evaluation years and budget proposal years.',
  request: { params: z.strictObject({ jurisdiction_code: JurisdictionCode }) },
  responses: { ...ok(JurisdictionDetail), ...getErrors },
})

export const jurisdictionRoutes = routes()
  .openapi(listRoute, async (c) => c.json(await listJurisdictions(c.get('ctx'), c.req.valid('query')), 200))
  .openapi(getRoute, async (c) => c.json(await getJurisdiction(c.get('ctx'), c.req.valid('param').jurisdiction_code), 200))
