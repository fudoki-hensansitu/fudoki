// GET /.well-known/api-catalog: 風土記の API の在処（RFC 9727。server/agent-discovery.ts）
import { defineHandler } from 'void'
import { API_CATALOG, API_CATALOG_TYPE } from '../../server/agent-discovery'

export const GET = defineHandler(() => new Response(JSON.stringify(API_CATALOG), { headers: { 'Content-Type': API_CATALOG_TYPE, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } }))
