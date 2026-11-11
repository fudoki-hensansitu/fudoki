// GET /jurisdictions: 自治体の一覧は廃止した（自治体はホームのうちのまちから選ぶ）。外から来たリンクはホームへ 301
import { defineHandler } from 'void'

export const GET = defineHandler((c) => c.redirect('/', 301))
