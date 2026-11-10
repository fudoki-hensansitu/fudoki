import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { Landing } from '../landing/landing'
import { fetchRoute } from './routes.testing'
import { BACKGROUND_DARK, BACKGROUND_LIGHT } from '../tokens'
import config from '../void.config'
import { EMBLEMS } from '../jurisdiction/emblems'

// web の頁は Void が描き、ファイルは public/ から配る。ここは頁の本文・配るファイル・PWA の繋ぎを確かめる（画面の振る舞いは手元の e2e で見る）
const get = (path: string) => fetchRoute(new Request(`https://fudoki.dev${path}`), {})
const PUBLIC = new URL('../public/', import.meta.url).pathname
const served = (path: string) => existsSync(`${PUBLIC}${path.slice(1)}`)

test('紹介の頁は MCP とプライバシーポリシーへ繋ぎ、検索エンジン・ブラウザが取りに来るファイルを配る', async () => {
  const html = renderToString(createElement(Landing))
  expect(html).toContain('https://api.fudoki.dev/mcp')
  expect(html).toContain('https://docs.fudoki.dev/privacy')
  for (const path of ['/favicon.svg', '/favicon.ico', '/icon.png', '/apple-touch-icon.png', '/og.png', '/robots.txt', '/home/origin.webp', '/home/demo.mp4']) expect(served(path), path).toBe(true)
  expect((await get('/sitemap.xml')).status).toBe(200)
  const meta = config.head?.meta ?? []
  expect(meta).toContainEqual({ property: 'og:image', content: 'https://fudoki.dev/og.png' })
  // 自治体の頁は紋章があれば og:image を public/jurisdictions/<code>/og.png に差し替える（作るのは build:og）
  for (const code of Object.keys(EMBLEMS)) expect(served(`/jurisdictions/${code}/og.png`), code).toBe(true)
})

test('PWA: manifest・service worker・アイコン・オフラインの頁を返し、全頁の head から繋ぐ', async () => {
  const manifest = await get('/manifest.webmanifest')
  expect(manifest.status).toBe(200)
  const json = (await manifest.json()) as { start_url: string; display: string; icons: { src: string; purpose: string }[] }
  expect(json.display).toBe('standalone')
  for (const icon of json.icons) expect(served(icon.src), icon.src).toBe(true)
  expect(json.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  const sw = await get('/sw.js')
  expect(sw.status).toBe(200)
  expect(sw.headers.get('Cache-Control')).toBe('no-cache')
  expect((await get('/offline')).status).toBe(200)
  expect(config.head?.link).toContainEqual({ rel: 'manifest', href: '/manifest.webmanifest' })
  expect(config.head?.script?.some((s) => s.innerHTML?.includes("register('/sw.js')"))).toBe(true)
})

test('画面の背景色は tokens.ts と styles/tokens.css で同じ', async () => {
  const css = await Bun.file(new URL('../styles/tokens.css', import.meta.url)).text()
  const backgrounds = css.match(/--background:light-dark\((#[0-9a-f]{6}),(#[0-9a-f]{6})\)/)?.slice(1)
  expect(backgrounds).toEqual([BACKGROUND_LIGHT, BACKGROUND_DARK])
})
