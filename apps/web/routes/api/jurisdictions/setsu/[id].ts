// GET /api/jurisdictions/setsu/:id: 目の節（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { setsuResponse } from '../../../../server/jurisdiction-routes'
import type { Env } from '../../../../server/env'

export const GET = defineHandler((c) => setsuResponse(c.env as unknown as Env, c.req.raw, c.req.param('id')!))
