// MCP Apps の View を1つの HTML にまとめ、Worker が import する src/view.generated.ts を書く。
//   bun ui/build.ts          # 書き直す
//   bun ui/build.ts --check  # 最新かだけ検査する（view.test.ts も同じ検査をする）
// host は ui:// のリソースを iframe に入れ、既定の CSP は inline の script だけを許す（外部の script・fetch は不可）ので、
// ext-apps の App と依存を bundle して inline する。リソースの URI に中身のハッシュを入れ、変えたら別の URI にする（host は URI でキャッシュする）。
import { readFileSync } from 'node:fs'

const dir = new URL('.', import.meta.url).pathname
export const OUTPUT = new URL('../src/view.generated.ts', import.meta.url).pathname

export async function render(): Promise<string> {
  const result = await Bun.build({ entrypoints: [`${dir}view.ts`], target: 'browser', format: 'esm', minify: true })
  if (!result.success) throw new AggregateError(result.logs, 'View の bundle に失敗した')
  // </script> が文字列に現れても script を閉じないようにする
  const js = (await result.outputs[0]!.text()).replaceAll('</script', '<\\/script')
  const html = readFileSync(`${dir}view.html`, 'utf8').replace('<!-- script -->', () => `<script type="module">${js}</script>`)
  const hash = new Bun.CryptoHasher('sha256').update(html).digest('hex').slice(0, 12)
  return (
    '// ui/build.ts の生成物。手で編集しない（bun ui/build.ts で書き直す）。\n' +
    `export const VIEW_URI = 'ui://fudoki/view-${hash}.html'\n` +
    `export const VIEW_HTML = ${JSON.stringify(html)}\n`
  )
}

if (import.meta.main) {
  const text = await render()
  if (process.argv.includes('--check')) {
    if ((await Bun.file(OUTPUT).text().catch(() => '')) !== text) {
      console.error(`${OUTPUT} が古い。bun ui/build.ts で書き直す`)
      process.exit(1)
    }
  } else {
    await Bun.write(OUTPUT, text)
  }
}
