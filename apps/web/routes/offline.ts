// GET /offline: 繋がらないときに service worker が見せる頁（pwa.ts）。サイドバーも JS も持たない1枚
import { defineHandler } from 'void'
import { OFFLINE_HTML } from '../pwa'

export const GET = defineHandler(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } }))
