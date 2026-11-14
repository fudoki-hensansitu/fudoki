// GET /api/jurisdictions/<code>/<year>/setsu/<initial|settlement>: 予算・決算のタブの一般会計の流れの図の、目ごとの節（無ければ事業）。ほかの会計は [phase]/[account].ts。
// 節は最初の画面に出さないので、頁を描いた後にブラウザが読む（jurisdiction/app/app-page.tsx の MoneyTab）
import { defineHandler } from 'void'
import { setsuResponse } from '../../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../../server/env'

export const GET = defineHandler((c) => setsuResponse(c.env as unknown as Env, c.req.raw, c.req.param('code') ?? '', c.req.param('year') ?? '', c.req.param('phase') ?? ''))
