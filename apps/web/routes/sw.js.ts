// GET /sw.js: service worker（pwa.ts）。ブラウザは 24 時間まで古い sw.js を使うので、更新を遅らせないよう no-cache にする
import { defineHandler } from 'void'
import { SERVICE_WORKER } from '../pwa'

export const GET = defineHandler(() => new Response(SERVICE_WORKER, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } }))
