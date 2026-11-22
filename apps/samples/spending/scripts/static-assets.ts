// build の出力の worker.config.json で、Vite の /assets を Worker を通さず Cloudflare が直に配るようにする（vite build の後に走る）。
// void 1.10 は全要求を Worker に通し（run_worker_first: /**）、頁の loader の 404 を「意図した 404」として assets を探しに行かないので、
// `/:code` の頁に当たる `/assets/*.css` が 404 になる（apps/web/scripts/static-assets.ts と同じ理由）。favicon・OG 画像は middleware が本体へ中継する
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const WORKER_CONFIG = fileURLToPath(new URL('../.cloudflare/output/v1/workers/default/worker.config.json', import.meta.url))

if (!existsSync(WORKER_CONFIG)) throw new Error(`build の出力が無い: ${WORKER_CONFIG}`)
const config = JSON.parse(readFileSync(WORKER_CONFIG, 'utf8')) as { assets?: { runWorkerFirst?: string[] } }
const rules = config.assets?.runWorkerFirst
if (!rules || rules.length !== 1 || rules[0] !== '/**') throw new Error(`run_worker_first が想定と違う: ${JSON.stringify(rules)}`)
config.assets!.runWorkerFirst = ['/**', '!/assets/*']
writeFileSync(WORKER_CONFIG, JSON.stringify(config))
