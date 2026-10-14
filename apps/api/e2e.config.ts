import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'
// `reuseExisting` は `dev:ui` や前回の実行が残した 4317 の server を再利用する。
// 残った server が古いと、無関係の変更で e2e が落ちる。落ちたら port を空けて（server を止めて）再実行する。
export default {
  tests: 'tests/*.e2e.ts',
  targets: [{ engine: web(), app: { url: process.env.PDF_QA_URL ?? 'http://127.0.0.1:4317', command: { executable: 'bun', args: ['tests/server.ts'], env: { PORT: new URL(process.env.PDF_QA_URL ?? 'http://127.0.0.1:4317').port }, log: '.e2e/logs/server.log', reuseExisting: true } } }],
  workers: 1, timeout: 90_000, reporters: ['list'],
} satisfies E2EConfig
