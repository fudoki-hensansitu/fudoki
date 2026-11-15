// POST /api/sheets/counts: 自治体の頁の評価シートの方向性の区分ごとの数（server/project-routes.ts）
import { defineHandler } from 'void'
import { sheetCountResponse } from '../../../server/project-routes'
import type { Env } from '../../../server/env'

export const POST = defineHandler((c) => sheetCountResponse(c.env as unknown as Env, c.req.raw))
