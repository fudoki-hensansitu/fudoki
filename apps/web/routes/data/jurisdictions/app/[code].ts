// GET /data/jurisdictions/app/:code: 自治体の頁（アプリ型）のデータ（server/jurisdiction-routes.ts）
import { defineHandler } from 'void'
import { appDataResponse } from '../../../../server/jurisdiction-routes'
import type { Env } from '../../../../server/env'

export const GET = defineHandler((c) => appDataResponse(c.env as unknown as Env, c.req.raw, c.req.param('code')!))
