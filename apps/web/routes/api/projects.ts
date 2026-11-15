// /api/projects: 自治体の頁の事業の一覧の続き（POST）と、評価シートをつないだ事業（GET ?project=）。server/project-routes.ts
import { defineHandler } from 'void'
import { projectListResponse, projectOfIdResponse } from '../../server/project-routes'
import type { Env } from '../../server/env'

export const POST = defineHandler((c) => projectListResponse(c.env as unknown as Env, c.req.raw))
export const GET = defineHandler((c) => projectOfIdResponse(c.env as unknown as Env, c.req.raw))
