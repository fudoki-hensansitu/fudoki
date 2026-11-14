// GET /api/jurisdictions/<code>/<year>/extras: 自治体の頁の1年度の、最初の画面に要らない分（施策・評価シート・事業の1頁目）。
// 頁を描いた後にブラウザが読む（jurisdiction/app/app-page.tsx）。CDN には置かず、毎回 api の内部の RPC で読む
import { defineHandler } from 'void'
import { yearPartResponse } from '../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../server/env'

export const GET = defineHandler((c) => yearPartResponse(c.env as unknown as Env, c.req.raw, c.req.param('code') ?? '', c.req.param('year') ?? '', 'extras'))
