// GET /jurisdiction-years/<code>/<year>/extras: 自治体の頁の1年度の、最初の画面に要らない分（施策・評価シート・事業の1頁目）。
// 頁を描いた後にブラウザが読む（jurisdiction/app/app-page.tsx）。頁と同じく CDN（Void の ISR、void.config.ts の routing）に置く
import { defineHandler } from 'void'
import { yearPartResponse } from '../../../../server/jurisdiction-routes'
import type { Env } from '../../../../server/env'

export const GET = defineHandler((c) => yearPartResponse(c.env as unknown as Env, c.req.param('code') ?? '', c.req.param('year') ?? '', 'extras'))
