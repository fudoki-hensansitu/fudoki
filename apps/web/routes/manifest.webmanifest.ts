// GET /manifest.webmanifest: ホーム画面に追加するときの名前・色・アイコン（pwa.ts）
import { defineHandler } from 'void'
import { MANIFEST } from '../pwa'

export const GET = defineHandler(() => new Response(MANIFEST, { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } }))
