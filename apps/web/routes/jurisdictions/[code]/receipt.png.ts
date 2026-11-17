// GET /jurisdictions/<code>/receipt.png?year=: ホームのレシートをシェアしたときの OG 画像（server/og-receipt.ts）。
// ホームの札と同じ1年度のデータから描き、CDN（Void の ISR、void.config.ts の routing。year は key に残す）に1日置く。人口の無い自治体・頁に無い年度は 404
import { defineHandler } from 'void'
import { receiptOgInput } from '../../../server/jurisdiction-routes'
import { receiptOgSvg } from '../../../server/og-receipt'
import { renderPng } from '../../../server/og-render'
import type { Env } from '../../../server/env'

const MAX_AGE = 86400

export const GET = defineHandler(async (c) => {
  const env = c.env as unknown as Env
  const code = c.req.param('code') ?? ''
  const year = c.req.query('year')
  if (!/^\d{6}$/.test(code) || (year !== undefined && !/^\d{4}$/.test(year))) return c.notFound()
  const input = await receiptOgInput(env, code, year === undefined ? undefined : Number(year))
  if (!input) return c.notFound()
  const png = await renderPng(receiptOgSvg(input))
  // ISR の TTL は応答の x-revalidate が最優先（og.png.ts と同じ）
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${MAX_AGE}`, 'x-revalidate': String(MAX_AGE) } })
})
