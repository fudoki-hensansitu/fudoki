// OG 画像の SVG を PNG にする（resvg の wasm）。wasm は isolate ごとに一度だけ初期化する。試験（bun）からは読まない
// Worker は書体を持たないので、SVG に書いた字だけを含む書体を Google Fonts（css2 の text=）から取って resvg に渡す
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import wasm from '@resvg/resvg-wasm/index_bg.wasm'
import { OG_FONT, ogChars } from './og'

let ready: Promise<void> | undefined

/** 字を絞った書体（TrueType）。ブラウザでない User-Agent には truetype の url を返す */
async function font(chars: string): Promise<Uint8Array> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(OG_FONT)}:wght@500&text=${encodeURIComponent(chars)}`, {
    headers: { 'User-Agent': 'fudoki-og' },
    signal: AbortSignal.timeout(5000),
  })
  if (!css.ok) throw new Error(`Google Fonts の CSS が読めません（${css.status}）`)
  const url = (await css.text()).match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)?.[1]
  if (!url) throw new Error('Google Fonts の CSS に truetype の url がありません')
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`書体が読めません（${res.status}）`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function renderPng(svg: string): Promise<Uint8Array<ArrayBuffer>> {
  ready ??= initWasm(wasm as WebAssembly.Module)
  const [buffer] = await Promise.all([font(ogChars(svg)), ready])
  return new Uint8Array(new Resvg(svg, { font: { fontBuffers: [buffer], defaultFontFamily: OG_FONT, loadSystemFonts: false } }).render().asPng())
}
