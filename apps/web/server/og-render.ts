// OG 画像の SVG を PNG にする（resvg の wasm）。wasm は isolate ごとに一度だけ初期化する。試験（bun）からは読まない
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import wasm from '@resvg/resvg-wasm/index_bg.wasm'

let ready: Promise<void> | undefined

export async function renderPng(svg: string): Promise<Uint8Array<ArrayBuffer>> {
  ready ??= initWasm(wasm as WebAssembly.Module)
  await ready
  return new Uint8Array(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng())
}
