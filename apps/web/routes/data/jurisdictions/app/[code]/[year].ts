// GET /data/jurisdictions/app/:code/:year: 自治体の頁（アプリ型）の、一つの年度の分のデータ（server/jurisdiction-routes.ts の sliceSnapshot）。
// 頁の loader が渡さなかった年度を画面が取る。path に年度を入れるのは、ISR の cache の key が query を落とすため
import { defineHandler } from 'void'
import { appDataResponse } from '../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../server/env'

export const GET = defineHandler((c) => appDataResponse(c.env as unknown as Env, c.req.raw, c.req.param('code')!, c.req.param('year')))
