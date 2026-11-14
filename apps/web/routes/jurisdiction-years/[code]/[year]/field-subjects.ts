// GET /jurisdiction-years/<code>/<year>/field-subjects: その年度の分野ごとの末端の科目。やめた事業を分野で絞るときだけ、ブラウザが前の年度の分を読む。
// CDN（Void の ISR、void.config.ts の routing）に置く
import { defineHandler } from 'void'
import { yearPartResponse } from '../../../../server/jurisdiction-routes'
import type { Env } from '../../../../server/env'

export const GET = defineHandler((c) => yearPartResponse(c.env as unknown as Env, c.req.param('code') ?? '', c.req.param('year') ?? '', 'field-subjects'))
