// GET /api/jurisdictions/<code>/<year>/setsu/<initial|settlement>/<会計>: 一般会計のほかの会計の流れの図の、目ごとの節。一般会計は ../[phase].ts
import { defineHandler } from 'void'
import { setsuResponse } from '../../../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../../../server/env'

export const GET = defineHandler((c) => setsuResponse(c.env as unknown as Env, c.req.raw, c.req.param('code') ?? '', c.req.param('year') ?? '', c.req.param('phase') ?? '', c.req.param('account') ?? ''))
