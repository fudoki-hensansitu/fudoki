// GET /sitemap-projects.xml: 事業の頁の sitemap の目次（自治体ごとの /jurisdictions/<code>/sitemap.xml）。robots.txt に載せる
import { defineHandler } from 'void'
import { projectSitemapIndexResponse } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'

export const GET = defineHandler((c) => projectSitemapIndexResponse(c.env as unknown as Env))
