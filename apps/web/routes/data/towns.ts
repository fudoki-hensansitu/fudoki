// GET /data/towns。サイドバーの検索が引く、収録している自治体の一覧（ホームと同じ要約）
import { defineHandler } from 'void'
import { homeEntries } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'

export const GET = defineHandler(async (c) => {
  const entries = await homeEntries(c.env as unknown as Env).catch(() => null)
  // 失敗を空の一覧として cache させない。503 なら引く側が次にもう一度取りに行く
  if (!entries) return c.json({ error: 'unavailable' }, 503, { 'Cache-Control': 'no-store' })
  return c.json(entries, 200, { 'Cache-Control': 'public, max-age=300' })
})
