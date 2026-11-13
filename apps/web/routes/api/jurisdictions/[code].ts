// GET /api/jurisdictions/:code?year=: ホームのうちのまちの札が読む、自治体の頁の1年度のデータ（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { jurisdictionSnapshotResponse } from '../../../server/jurisdiction-routes'
import type { Env } from '../../../server/env'

export const GET = defineHandler((c) => jurisdictionSnapshotResponse(c.env as unknown as Env, c.req.raw, c.req.param('code')!))
