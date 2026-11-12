// 試験から routes/ をそのまま叩くための Hono の app。Void の file routing（routes/a/[id].ts → /a/:id、export した method）と同じ形に組む
import { Hono } from 'hono'
import type { Env } from './env'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const
const dir = new URL('../routes/', import.meta.url).pathname

export async function routesApp() {
  const app = new Hono<{ Bindings: Env }>()
  for (const file of [...new Bun.Glob('**/*.ts').scanSync({ cwd: dir, dot: true })].sort()) {
    const path = `/${file.replace(/\.ts$/, '').replace(/\[([^\]]+)\]/g, ':$1')}`
    const mod = (await import(`${dir}${file}`)) as Partial<Record<(typeof METHODS)[number], Parameters<typeof app.on>[2]>>
    for (const m of METHODS) if (mod[m]) app.on(m, path, mod[m])
  }
  return app
}

/** routes/ に要求を一つ投げる（どの route にも当たらなければ 404） */
let app: ReturnType<typeof routesApp> | undefined
export const fetchRoute = async (request: Request, env: Env) => (await (app ??= routesApp())).fetch(request, env)
