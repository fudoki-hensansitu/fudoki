// GET /api/projects/:id?year=&kind=: 自治体の頁の事業の詳細（server/project-routes.ts）
import { defineHandler } from 'void'
import { projectResponse } from '../../../server/project-routes'
import type { Env } from '../../../server/env'

export const GET = defineHandler((c) => projectResponse(c.env as unknown as Env, c.req.raw, c.req.param('id')!))
