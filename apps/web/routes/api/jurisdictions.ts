// GET /api/jurisdictions?name=&cursor=: 町の検索（サイドバーのまちを探す・ホームの他のまちを見る・まち比べ）。語に当たる自治体を少しずつ返す（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { jurisdictionSearchResponse } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'

export const GET = defineHandler((c) => jurisdictionSearchResponse(c.env as unknown as Env, c.req.raw))
