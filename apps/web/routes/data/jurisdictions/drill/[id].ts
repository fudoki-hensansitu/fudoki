// GET /data/jurisdictions/drill/:id: 款・項の内訳（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { drillResponse } from '../../../../server/jurisdiction-routes'
import type { Env } from '../../../../server/env'

export const GET = defineHandler((c) => drillResponse(c.env as unknown as Env, c.req.raw, c.req.param('id')!))
