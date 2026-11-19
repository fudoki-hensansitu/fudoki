// build の出力の worker.config.json で、静的資産を Worker を通さず Cloudflare が直に配るようにする（vite build の後に走る）。
// void 1.10 は全要求を Worker に通し（run_worker_first: /**）、頁の loader の 404 を「意図した 404」として assets を探しに行かない。
// `/:prefecture`・`/:prefecture/:name` の頁に当たる `/favicon.svg`・`/assets/*.css` が 404 になるので、Vite の /assets・public/ の file と dir・
// 紋章の SVG を否定の rule で外す。void.config の cloudflare.assets は出力に移らず、vite の plugin で書いても void が build の最後に上書きするため、ここで書く
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const WORKER_CONFIG = fileURLToPath(new URL('../.cloudflare/output/v1/workers/default/worker.config.json', import.meta.url))
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url))

if (!existsSync(WORKER_CONFIG)) throw new Error(`build の出力が無い: ${WORKER_CONFIG}`)
const config = JSON.parse(readFileSync(WORKER_CONFIG, 'utf8')) as { assets?: { runWorkerFirst?: string[] } }
const rules = config.assets?.runWorkerFirst
if (!rules || rules.length !== 1 || rules[0] !== '/**') throw new Error(`run_worker_first が想定と違う: ${JSON.stringify(rules)}`)
config.assets!.runWorkerFirst = [
  '/**',
  '!/assets/*',
  '!/jurisdictions/*/emblem.svg',
  ...readdirSync(PUBLIC, { withFileTypes: true })
    .filter((e) => e.name !== 'jurisdictions')
    .map((e) => (e.isDirectory() ? `!/${e.name}/*` : `!/${e.name}`)),
]
writeFileSync(WORKER_CONFIG, JSON.stringify(config))
