// 試作: GET /api/prototype/project/:id。追っている事業の年度ごとの金額（apps/api の /v1/projects/:id をそのまま返す）
import { defineHandler } from 'void'
import type { Env } from '../../../../server/env'
import { apiGet } from '../../../../server/prototype-api'

export const GET = defineHandler(async (c) => {
  const id = c.req.param('id') ?? ''
  if (!/^[0-9a-f]{64}$/.test(id)) return c.json({ error: 'bad id' }, 400)
  try {
    return c.json(await apiGet(c.env as unknown as Env, `/v1/projects/${id}`), 200, { 'Cache-Control': 'public, max-age=300' })
  } catch {
    return c.json({ error: 'unavailable' }, 502)
  }
})
