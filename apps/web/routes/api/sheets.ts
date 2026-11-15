// POST /api/sheets: 自治体の頁の評価シートの一覧の1頁（server/project-routes.ts）
import { defineHandler } from 'void'
import { sheetListResponse } from '../../server/project-routes'
import type { Env } from '../../server/env'

export const POST = defineHandler((c) => sheetListResponse(c.env as unknown as Env, c.req.raw))
