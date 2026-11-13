// 歳出の集約の REST。route は書き下ろし、型を AppType に載せる。
import { createRoute, z } from '@hono/zod-openapi'
import { originPdf } from '../origin-pdf'
import { ErrorBody, getErrors, ok, postErrors, routes } from '../shared/http'
import { queryPageSize, pageTokenOf } from '../shared/paging'
import { DetailSearchOutput, LineId, LineOutput, SubjectSearchOutput } from './model'
import { getLine, searchDetails, searchSubjects } from './queries'
import { DETAIL_SEARCH_EXAMPLE, SUBJECT_SEARCH_EXAMPLE, expenditureTools as t } from './tools'

export const ORIGIN_PDF_PATH = '/v1/expenditures/origins/:origin_id/pdf'

const searchSubjectsRoute = createRoute({
  method: 'post',
  path: '/v1/expenditures/subjects:search',
  operationId: t.searchSubjects.name,
  summary: '歳出の科目（款・項・目）を検索する',
  description: t.searchSubjects.description,
  request: { body: { required: true, content: { 'application/json': { schema: t.searchSubjects.input, example: SUBJECT_SEARCH_EXAMPLE } } } },
  responses: { ...ok(SubjectSearchOutput), ...postErrors },
})

const searchDetailsRoute = createRoute({
  method: 'post',
  path: '/v1/expenditures/details:search',
  operationId: t.searchDetails.name,
  summary: '歳出の内訳（事業・節）を検索する',
  description: t.searchDetails.description,
  request: { body: { required: true, content: { 'application/json': { schema: t.searchDetails.input, example: DETAIL_SEARCH_EXAMPLE } } } },
  responses: { ...ok(DetailSearchOutput), ...postErrors },
})

const getLineRoute = createRoute({
  method: 'get',
  path: '/v1/expenditures/lines/{line_id}',
  operationId: t.getLine.name,
  summary: '歳出の行（科目か内訳）と、その直下を取得する',
  description: t.getLine.description,
  request: {
    params: z.strictObject({ line_id: LineId }),
    query: z.strictObject({ page_size: queryPageSize(), page_token: pageTokenOf('line_id') }),
  },
  responses: { ...ok(LineOutput), ...getErrors },
})

const originPdfRoute = createRoute({
  method: 'get',
  path: '/v1/expenditures/origins/{origin_id}/pdf',
  operationId: 'get_origin_pdf',
  summary: '出典の PDF を表示する',
  description:
    '出典 ID が指す自治体の公開 PDF を中継する。32 MiB・20秒、取得6回/分（同一URL1回/分）、閲覧120回/分、成功PDFを24時間・最大16 URL保持。上限は全利用者合計。取得 URL（percent-encoding）と取得日時を X-Origin-Url・X-Origin-Fetched-At で返す。取り込み時の内容との一致は保証しない。query・任意 URL・リダイレクト・CSV は受け付けない。',
  request: { params: z.object({ origin_id: z.string().min(1).max(256) }) },
  responses: {
    200: { description: 'PDF', content: { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } } },
    ...Object.fromEntries([400, 404, 429, 502, 503, 504].map((status) => [status, { description: '表示できない', content: { 'application/json': { schema: ErrorBody } } }])),
  },
})

export const expenditureRoutes = routes()
  .openapi(searchSubjectsRoute, async (c) => c.json(await searchSubjects(c.get('ctx'), c.req.valid('json')), 200))
  .openapi(searchDetailsRoute, async (c) => c.json(await searchDetails(c.get('ctx'), c.req.valid('json')), 200))
  .openapi(getLineRoute, async (c) => c.json(await getLine(c.get('ctx'), { ...c.req.valid('param'), ...c.req.valid('query') }), 200))
  .openapi(originPdfRoute, (c) => originPdf(c.env.DB, c.env.ORIGIN_PDF, c.req.raw, c.req.valid('param').origin_id) as never)
