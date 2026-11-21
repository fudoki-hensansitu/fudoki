// GET /api/jurisdictions/<code>/<year>/project-links: 事業の行（内訳の ID）から事業の ID。お金の流れの表で事業の行を出したときに、ブラウザがその行の分だけ読む
import { defineHandler } from 'void'
import { projectLinksResponse } from '../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../server/env'

export const GET = defineHandler((c) => projectLinksResponse(c.env as unknown as Env, c.req.raw, c.req.param('code') ?? '', c.req.param('year') ?? ''))
