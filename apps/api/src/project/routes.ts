// 事業の集約の REST。route は書き下ろし、型を AppType に載せる。
import { createRoute, z } from '@hono/zod-openapi'
import { getErrors, ok, postErrors, routes } from '../shared/http'
import { ProjectId, ProjectOutput, ProjectSearchOutput } from './model'
import { getProject, searchProjects } from './queries'
import { PROJECT_SEARCH_EXAMPLE, projectTools as t } from './tools'

const getRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{project_id}',
  operationId: t.get.name,
  summary: '事業を年度・評価シート・施策まで取得する',
  description: t.get.description,
  request: { params: z.strictObject({ project_id: ProjectId }) },
  responses: { ...ok(ProjectOutput), ...getErrors },
})

const searchRoute = createRoute({
  method: 'post',
  path: '/v1/projects:search',
  operationId: t.search.name,
  summary: '事業の年度を検索する',
  description: t.search.description,
  request: { body: { required: true, content: { 'application/json': { schema: t.search.input, example: PROJECT_SEARCH_EXAMPLE } } } },
  responses: { ...ok(ProjectSearchOutput), ...postErrors },
})

export const projectRoutes = routes()
  .openapi(searchRoute, async (c) => c.json(await searchProjects(c.get('ctx'), c.req.valid('json')), 200))
  .openapi(getRoute, async (c) => c.json(await getProject(c.get('ctx'), c.req.valid('param')), 200))
