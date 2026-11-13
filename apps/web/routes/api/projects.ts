// /api/projects: 自治体の頁の事業の一覧の続き（POST）と、施策・評価シートを紐付けた事業（GET ?detail=）。server/project-routes.ts
import { defineHandler } from 'void'
import { projectListResponse, projectOfDetailResponse } from '../../server/project-routes'
import type { Env } from '../../server/env'

export const POST = defineHandler((c) => projectListResponse(c.env as unknown as Env, c.req.raw))
export const GET = defineHandler((c) => projectOfDetailResponse(c.env as unknown as Env, c.req.raw))
