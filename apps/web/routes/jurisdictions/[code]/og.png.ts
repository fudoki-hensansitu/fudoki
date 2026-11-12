// GET /jurisdictions/<code>/og.png: 自治体の頁の OG 画像。頁と同じデータから描き（server/og.ts）、CDN（Void の ISR、void.config.ts の routing）に1日置く。
// 紋章・決算の無い自治体は 404（頁の og:image も全頁共通の画像のまま。jurisdiction/html.ts）
import { defineHandler } from 'void'
import { ogInput } from '../../../server/jurisdiction-routes'
import { ogSvg } from '../../../server/og'
import { renderPng } from '../../../server/og-render'
import type { Env, Fetcher } from '../../../server/env'

const MAX_AGE = 86400

export const GET = defineHandler(async (c) => {
  const env = c.env as unknown as Env & { ASSETS: Fetcher }
  const code = c.req.param('code') ?? ''
  if (!/^\d{6}$/.test(code)) return c.notFound()
  const input = await ogInput(env, code, env.ASSETS)
  if (!input) return c.notFound()
  const png = await renderPng(ogSvg(input))
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${MAX_AGE}` } })
})
