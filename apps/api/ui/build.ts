// MCP Apps の View を1つの HTML にまとめ、Worker が import する src/gen/view.ts を書く。
// src/gen/ は commit しない。test・typecheck・dev・deploy・openapi の script が先に bun ui/build.ts を実行する。
// host は ui:// のリソースを iframe に入れ、既定の CSP は inline の script だけを許す（外部の script・fetch は不可）ので、
// ext-apps の App と依存を bundle して inline する。リソースの URI に中身のハッシュを入れ、変えたら別の URI にする（host は URI でキャッシュする）。
import { readFileSync } from 'node:fs'
import postcss, { type Plugin } from 'postcss'
import tailwind from '@tailwindcss/postcss'

const dir = new URL('.', import.meta.url).pathname
const OUTPUT = new URL('../src/gen/view.ts', import.meta.url)
  .pathname

export async function renderHtml(): Promise<string> {
  const [result, css] = await Promise.all([
    Bun.build({
      entrypoints: [`${dir}view.tsx`],
      target: 'browser',
      format: 'esm',
      minify: true,
      define: {
        'process.env.NODE_ENV': JSON.stringify(
          process.env.VIEW_REACT_MODE ?? 'production',
        ),
      },
    }),
    postcss([tailwind({ base: dir, optimize: true }) as Plugin]).process(
      readFileSync(`${dir}styles.css`, 'utf8'),
      { from: `${dir}styles.css` },
    ),
  ])
  if (!result.success)
    throw new AggregateError(result.logs, 'View の bundle に失敗した')
  // </script> が文字列に現れても script を閉じないようにする
  const js = (await result.outputs[0]!.text()).replaceAll(
    '</script',
    '<\\/script',
  )
  if (/@import\s|url\((?!["']?data:)/i.test(css.css))
    throw new Error('View CSS に外部参照が残っています')
  const html = readFileSync(`${dir}view.html`, 'utf8')
    .replace(
      '<!-- style -->',
      () => `<style>${css.css.replaceAll('</style', '<\\/style')}</style>`,
    )
    .replace('<!-- script -->', () => `<script type="module">${js}</script>`)
  return html
}

async function render(): Promise<string> {
  const html = await renderHtml()
  const hash = new Bun.CryptoHasher('sha256')
    .update(html)
    .digest('hex')
    .slice(0, 12)
  return (
    '// ui/build.ts の生成物。commit せず、手で編集しない（bun ui/build.ts で書き直す）。\n' +
    `export const VIEW_URI = 'ui://fudoki/view-${hash}.html'\n` +
    `export const VIEW_HTML = ${JSON.stringify(html)}\n`
  )
}

if (import.meta.main) await Bun.write(OUTPUT, await render())
