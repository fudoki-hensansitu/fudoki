// GET /data/jurisdictions/flow/:code/:year/:depth: 一つの自治体・年度の全款の流れ（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { flowResponse } from '../../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../../server/env'

export const GET = defineHandler((c) => flowResponse(c.env as unknown as Env, c.req.raw, { code: c.req.param('code')!, year: c.req.param('year')!, depth: c.req.param('depth')! }))
