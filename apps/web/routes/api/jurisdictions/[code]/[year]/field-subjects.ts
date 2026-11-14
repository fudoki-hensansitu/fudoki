// GET /api/jurisdictions/<code>/<year>/field-subjects: その年度の分野ごとの末端の科目。やめた事業を分野で絞るときだけ、ブラウザが前の年度の分を読む
import { defineHandler } from 'void'
import { yearPartResponse } from '../../../../../server/jurisdiction-routes'
import type { Env } from '../../../../../server/env'

export const GET = defineHandler((c) => yearPartResponse(c.env as unknown as Env, c.req.raw, c.req.param('code') ?? '', c.req.param('year') ?? '', 'field-subjects'))
