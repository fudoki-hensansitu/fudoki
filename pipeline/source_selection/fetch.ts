import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { matchesDeclaredFormat } from './archive'
import { downloadOriginal } from './download'

const USAGE = `Usage: bun pipeline/source_selection/fetch.ts <url> --out <path> [--format pdf|csv] [--landing <url>] [--browser fallback|never|only]
選定の調査で出典を1つ取り、--out に書いて、選定に写す値を1行の JSON で返す（sha256 は書いたバイト列から求める）。
風土記と名乗る User-Agent で取り、403・429・5xx・接続の失敗なら Orca のブラウザで --landing（無ければ出典の origin）を開いて頁の中で取り直す。
--format の形式でないバイト列（失効した URL が 200 で返す HTML など）は書かずに exit 1。sandbox の外で回す（Orca の socket とネットワークを使う）。`

async function main(args: string[]) {
  if (args.includes('--help') || args.length === 0) { console.log(USAGE); return }
  let url: string | undefined
  let out: string | undefined
  let format: 'pdf' | 'csv' = 'pdf'
  let landing: string | undefined
  let browser: 'fallback' | 'never' | 'only' = 'fallback'
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1]
    if (args[index] === '--out' && value) { out = value; index++ }
    else if (args[index] === '--format' && (value === 'pdf' || value === 'csv')) { format = value; index++ }
    else if (args[index] === '--landing' && value) { landing = value; index++ }
    else if (args[index] === '--browser' && (value === 'fallback' || value === 'never' || value === 'only')) { browser = value; index++ }
    else if (!url && !args[index].startsWith('--')) url = args[index]
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`)
  }
  if (!url || !out) throw new Error('url and --out are required')
  const downloaded = await downloadOriginal(url, { opener: landing, browser })
  const report = {
    download_url: url, final_url: downloaded.final_url, via: downloaded.via, status: downloaded.status,
    content_type: downloaded.content_type, bytes: downloaded.body.byteLength,
    sha256: createHash('sha256').update(downloaded.body).digest('hex'), format, format_ok: matchesDeclaredFormat(downloaded.body, format),
    out: resolve(out),
  }
  if (report.format_ok) {
    await mkdir(dirname(report.out), { recursive: true })
    await writeFile(report.out, downloaded.body)
  }
  console.log(JSON.stringify(report))
  if (!report.format_ok) process.exitCode = 1
}

if (import.meta.main) main(Bun.argv.slice(2)).catch(error => { console.error(JSON.stringify({ error: String(error) })); process.exitCode = 1 })
