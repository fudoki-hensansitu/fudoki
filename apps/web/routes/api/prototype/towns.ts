// 試作: GET /api/prototype/towns。サイドバーの検索が引く、収録している自治体の一覧（ホームと同じ要約）
import { defineHandler } from 'void'
import { homeEntries } from '../../../server/jurisdiction-routes'
import type { Env } from '../../../server/env'

export const GET = defineHandler(async (c) => {
  const entries = await homeEntries(c.env as unknown as Env).catch(() => [])
  return c.json(entries, 200, { 'Cache-Control': 'public, max-age=300' })
})
