// GET /sitemap.xml: 入口と、決算を収録している自治体の頁（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { sitemapResponse } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'

export const GET = defineHandler((c) => sitemapResponse(c.env as unknown as Env))
