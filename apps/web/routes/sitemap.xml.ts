// GET /sitemap.xml: 入口・まち比べと、決算を収録している自治体の頁（server/jurisdiction-routes.ts）。事業の頁は /sitemap-projects.xml
import { defineHandler } from 'void'
import { sitemapResponse } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'

export const GET = defineHandler((c) => sitemapResponse(c.env as unknown as Env))
