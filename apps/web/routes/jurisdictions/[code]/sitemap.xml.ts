// GET /jurisdictions/<code>/sitemap.xml: 自治体の事業の頁の sitemap（server/jurisdiction-routes.ts）。目次は /sitemap-projects.xml
import { defineHandler } from 'void'
import { projectSitemapResponse } from '../../../server/jurisdiction-routes'
import type { Env } from '../../../server/env'

export const GET = defineHandler((c) => {
  const code = c.req.param('code') ?? ''
  if (!/^\d{6}$/.test(code)) return c.notFound()
  return projectSitemapResponse(c.env as unknown as Env, code)
})
