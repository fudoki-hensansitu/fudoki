import type { E2EConfig } from 'e2e'
import { web } from '@e2e-dev/web'
export default {
  tests: 'tests/*.e2e.ts',
  targets: [{ engine: web(), app: { url: process.env.PDF_QA_URL ?? 'http://127.0.0.1:4317', command: { executable: 'bun', args: ['tests/server.ts'], env: { PORT: new URL(process.env.PDF_QA_URL ?? 'http://127.0.0.1:4317').port }, log: '.e2e/logs/server.log', reuseExisting: true } } }],
  workers: 1, timeout: 90_000, reporters: ['list'],
} satisfies E2EConfig
