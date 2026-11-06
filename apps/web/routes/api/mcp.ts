// POST /api/mcp: 会話の画面の View が呼ぶ tool と resource を許可リストで MCP へ中継する（server/api.ts・server/relay.ts）。POST 以外は 405
import { defineHandler } from 'void'
import { handleApi } from '../../server/api'

export const POST = defineHandler((c) => handleApi('/api/mcp', c))
export const GET = POST
