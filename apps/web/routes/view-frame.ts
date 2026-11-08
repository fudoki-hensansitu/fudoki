// GET /view-frame: 会話の頁が MCP Apps の View を描く iframe の器（server/csp.ts）。View の HTML は親が postMessage で渡す
import { defineHandler } from 'void'
import { VIEW_FRAME_CSP, VIEW_FRAME_HTML } from '../server/csp'

export const GET = defineHandler(
  () => new Response(VIEW_FRAME_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': VIEW_FRAME_CSP } }),
)
