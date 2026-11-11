// GET /api/jurisdictions/accounts/:code/:year: 一つの自治体・年度の会計ごとの総額（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { accountsResponse } from '../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../server/env'

export const GET = defineHandler((c) => accountsResponse(c.env as unknown as Env, c.req.raw, { code: c.req.param('code')!, year: c.req.param('year')! }))
