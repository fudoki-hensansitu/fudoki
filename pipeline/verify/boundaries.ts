import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { REPO } from '../runtime_paths'

async function files(directory: string): Promise<string[]> {
  const out: string[] = []
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        'dist',
        '.build',
        '.cache',
        '.wrangler',
        '.cloudflare',
        '.git',
      ].includes(item.name)
    )
      continue
    const path = join(directory, item.name)
    if (
      item.name.endsWith('.test.ts') ||
      item.name.endsWith('.test.tsx') ||
      item.name === 'test'
    )
      continue
    if (item.isDirectory()) out.push(...(await files(path)))
    else if (item.isFile() && /\.(?:ts|tsx|js|mjs|jsonc)$/.test(path))
      out.push(path)
  }
  return out
}
for (const root of ['apps', 'packages'])
  for (const path of await files(join(REPO, root))) {
    const body = await readFile(path, 'utf8')
    for (const match of body.matchAll(
      /(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g
    )) {
      const name = match[1]!,
        target = name.startsWith('.')
          ? relative(REPO, resolve(dirname(path), name))
          : name
      if (
        root === 'apps' &&
        target.startsWith('pipeline/')
      )
        throw new Error(
          `Public app imports pipeline internals: ${relative(REPO, path)}`
        )
      if (
        root === 'packages' &&
        (target.startsWith('pipeline/') ||
          target.startsWith('apps/') ||
          /^@fudoki\/(?:api|pipeline)/.test(name))
      )
        throw new Error(
          `Shared package imports an application: ${relative(REPO, path)}`
        )
    }
  }
// web はホーム・紹介と AI との会話、自治体のページを配る。データ（D1・R2・KV など）の binding は持たせず、データは apps/api に Service Binding で聞く。
// 許すのは Workers AI・Service Binding・流量・利用状況の記録と、binding でない Worker の設定だけ。文字列の var は worker.vars、secret は Worker 側に置く
// 例外として、本番だけ web 自身のデータ（今は AI との会話の保存。認証を足したら利用者も）の D1（binding DB・fudoki-web）を持てる。風土記のデータの D1 ではなく、それ以外の binding 名は許さない
const WEB_BINDING_KEYS = ['ai', 'services', 'ratelimits', 'analytics_engine_datasets']
const WEB_CLOUDFLARE_KEYS = new Set(['name', 'routes', 'workers_dev', 'observability', 'previews', 'd1_databases', ...WEB_BINDING_KEYS])
const WEB_PREVIEW_KEYS = new Set(['vars', ...WEB_BINDING_KEYS])
const WEB_WORKER_KEYS = new Set(['compatibility_date', 'vars'])
const { default: webConfig } = (await import(join(REPO, 'apps', 'web', 'void.config.ts'))) as {
  default: { cloudflare?: Record<string, unknown>; worker?: Record<string, unknown> }
}
for (const key of Object.keys(webConfig.cloudflare ?? {}))
  if (!WEB_CLOUDFLARE_KEYS.has(key))
    throw new Error(`Public web must not bind data: web (cloudflare.${key})`)
for (const d1 of (webConfig.cloudflare?.d1_databases as { binding?: string; database_name?: string }[] | undefined) ?? [])
  if (d1.binding !== 'DB' || d1.database_name !== 'fudoki-web')
    throw new Error(`Public web must not bind data: web (cloudflare.d1_databases.${d1.binding})`)
for (const key of Object.keys((webConfig.cloudflare?.previews as Record<string, unknown> | undefined) ?? {}))
  if (!WEB_PREVIEW_KEYS.has(key))
    throw new Error(`Public web must not bind data: web (cloudflare.previews.${key})`)
for (const key of Object.keys(webConfig.worker ?? {}))
  if (!WEB_WORKER_KEYS.has(key))
    throw new Error(`Public web must not bind data: web (worker.${key})`)
// docs は静的ファイルだけを配る。Worker のコードも binding（D1 などのデータ）も持たせない
const docsConfig = await readFile(
  join(REPO, 'apps', 'docs', 'cloudflare.config.ts'),
  'utf8'
)
if (/\b(?:bindings|entrypoint)\s*[:.]/.test(docsConfig))
  throw new Error('Docs app must serve static assets only (no entrypoint or bindings)')
console.log(
  JSON.stringify({
    publicAppsIndependent: true,
    sharedPackagesIndependent: true,
    publicAppsHaveNoDataBindings: true,
  })
)
