// GET /.well-known/mcp/server-card.json: 風土記の MCP の MCP Server Card（server/agent-discovery.ts）
import { defineHandler } from 'void'
import { MCP_SERVER_CARD } from '../../../server/agent-discovery'

export const GET = defineHandler(() => new Response(JSON.stringify(MCP_SERVER_CARD), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } }))
