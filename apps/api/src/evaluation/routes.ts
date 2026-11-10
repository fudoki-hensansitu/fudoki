// 事業評価の集約の REST。route は書き下ろし、型を AppType に載せる（web が Hono RPC で呼ぶ）。
import { createRoute, z } from '@hono/zod-openapi'
import { getErrors, ok, postErrors, routes } from '../shared/http'
import { pageTokenOf, queryPageSize } from '../shared/paging'
import { EvaluationId, EvaluationOutput, SheetId, SheetOutput, SheetSearchOutput } from './model'
import { getEvaluation, getSheet, searchSheets } from './queries'
import { SHEET_SEARCH_EXAMPLE, evaluationTools as t } from './tools'

const getRoute = createRoute({
  method: 'get',
  path: '/v1/evaluations/{evaluation_id}',
  operationId: t.get.name,
  summary: '事業評価の1年度（評価結果の件数・出典・評価シート）を取得する',
  description: t.get.description,
  request: {
    params: z.strictObject({ evaluation_id: EvaluationId }),
    query: z.strictObject({ page_size: queryPageSize(), page_token: pageTokenOf('evaluation_id') }),
  },
  responses: { ...ok(EvaluationOutput), ...getErrors },
})

const getSheetRoute = createRoute({
  method: 'get',
  path: '/v1/evaluations/sheets/{sheet_id}',
  operationId: t.getSheet.name,
  summary: '評価シート1枚を指標まで取得する',
  description: t.getSheet.description,
  request: { params: z.strictObject({ sheet_id: SheetId }) },
  responses: { ...ok(SheetOutput), ...getErrors },
})

const searchSheetsRoute = createRoute({
  method: 'post',
  path: '/v1/evaluations/sheets:search',
  operationId: t.searchSheets.name,
  summary: '評価シートを検索する',
  description: t.searchSheets.description,
  request: { body: { required: true, content: { 'application/json': { schema: t.searchSheets.input, example: SHEET_SEARCH_EXAMPLE } } } },
  responses: { ...ok(SheetSearchOutput), ...postErrors },
})

// sheets:search は {evaluation_id} より先に登録する（同じ形の path を取り合わないように）
export const evaluationRoutes = routes()
  .openapi(searchSheetsRoute, async (c) => c.json(await searchSheets(c.get('ctx'), c.req.valid('json')), 200))
  .openapi(getSheetRoute, async (c) => c.json(await getSheet(c.get('ctx'), c.req.valid('param')), 200))
  .openapi(getRoute, async (c) => c.json(await getEvaluation(c.get('ctx'), { ...c.req.valid('param'), ...c.req.valid('query') }), 200))
