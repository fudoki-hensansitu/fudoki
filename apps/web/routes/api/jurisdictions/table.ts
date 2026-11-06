// GET /api/jurisdictions/table: 自治体一覧の比較表を30件ずつ（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { tableResponse } from '../../../server/jurisdiction-routes'
import type { Env } from '../../../server/env'

export const GET = defineHandler((c) => tableResponse(c.env as unknown as Env, c.req.raw))
