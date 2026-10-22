// 入口の島（start）と会話の画面（session）の JS・CSS を static/_app/ に書く。Workers static assets が配る（生成物は commit しない）
//   bun chat/build.ts
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import postcss, { type Plugin } from 'postcss'
import tailwind from '@tailwindcss/postcss'

const dir = new URL('.', import.meta.url).pathname
const out = new URL('../static/_app/', import.meta.url).pathname
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const result = await Bun.build({
  entrypoints: [`${dir}start.tsx`, `${dir}session.tsx`, `${dir}../jurisdiction/jurisdiction.tsx`],
  outdir: out,
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: true,
  naming: { entry: '[name].[ext]', chunk: 'chunk-[hash].[ext]' },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
})
if (!result.success) throw new AggregateError(result.logs, 'chat の bundle に失敗した')

for (const [name, from] of [['start', `${dir}start.css`], ['session', `${dir}session.css`], ['jurisdiction', `${dir}../jurisdiction/jurisdiction.css`]] as const) {
  const css = await postcss([tailwind({ base: dir, optimize: true }) as Plugin]).process(readFileSync(from, 'utf8'), { from })
  await Bun.write(`${out}${name}.css`, css.css)
}
for (const o of result.outputs) console.log(o.path.replace(out, 'static/_app/'), `${Math.round(o.size / 1024)} KiB`)
