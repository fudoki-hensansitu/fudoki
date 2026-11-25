// GET /assistant: 前のアシスタントの頁。2026-11-25 に頁を消した（会話は自治体の頁の中で開く）。検索エンジン・ブックマークから来た人はホームへ移す
import { defineHandler } from 'void'

export const GET = defineHandler(() => new Response(null, { status: 301, headers: { Location: '/', 'Cache-Control': 'public, max-age=86400' } }))
