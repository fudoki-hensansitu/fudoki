// GET /data/compare-map.json: まち比べ（apps/samples の /compare）の地図のデータ。東京都のまちの、問いごとの値（server/compare-map.ts）。
// サンプルの loader が Service Binding で読む。/api の下に置かないのは、CDN（ISR、void.config.ts の revalidate）に置くため
import { defineHandler } from 'void'
import { compareMapResponse } from '../../server/compare-map'
import type { Env } from '../../server/env'

export const GET = defineHandler((c) => compareMapResponse(c.env as unknown as Env))
