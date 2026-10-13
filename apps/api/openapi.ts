// apps/docs の API リファレンスの入力。D1 を読まずに、route の定義から OpenAPI 文書を書き出す。
import { OPENAPI_CONFIG, createApp } from './src/app'

const out = process.argv[2]
if (!out) throw new Error('usage: bun openapi.ts <output.json>')
await Bun.write(out, `${JSON.stringify(createApp().getOpenAPI31Document(OPENAPI_CONFIG), null, 2)}\n`)
