// public/og.png（全頁共通の OG 画像）を server/og-site.ts の SVG から作る。`bun run og:site`（apps/web）。
// 描き方は Worker の OG 画像（og-render.ts）と同じ resvg（wasm）と Google Fonts の書体
import { readFile, writeFile } from 'node:fs/promises'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { OG_FONT, ogChars } from '../server/og'
import { siteOgSvg } from '../server/og-site'

const svg = siteOgSvg()
const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(OG_FONT)}:wght@500&text=${encodeURIComponent(ogChars(svg))}`, { headers: { 'User-Agent': 'fudoki-og' } })
const url = (await css.text()).match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)?.[1]
if (!url) throw new Error('Google Fonts の CSS に truetype の url がありません')
const font = new Uint8Array(await (await fetch(url)).arrayBuffer())
await initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
const png = new Resvg(svg, { font: { fontBuffers: [font], defaultFontFamily: OG_FONT, loadSystemFonts: false } }).render().asPng()
await writeFile(new URL('../public/og.png', import.meta.url), png)
console.log(`public/og.png（${png.length} bytes）`)
