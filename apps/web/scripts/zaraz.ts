// fudoki.dev の Cloudflare Zaraz の設定（analytics/zaraz.json）を反映する。deploy-web が HTML を出す前に呼ぶ。
// 今の設定を読み、zaraz.json に書いた項目（settings の値・historyChange・trigger・tool）だけを揃える。dataLayer・debugKey・既定の trigger など他は残す。tool は zaraz.json のものだけにする
// 使い方: bun scripts/zaraz.ts（反映） / bun scripts/zaraz.ts --check（差があれば示して 1 で終わる）。CLOUDFLARE_API_TOKEN に Zone の Zaraz Edit（--check は Read）が要る
import managed from '../analytics/zaraz.json'

const ZONE = '523fdc71d7787b367a19091ebea6a2dc' // fudoki.dev
const url = `https://api.cloudflare.com/client/v4/zones/${ZONE}/settings/zaraz/config`
const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) throw new Error('CLOUDFLARE_API_TOKEN がありません')

type Config = Record<string, unknown> & { settings: Record<string, unknown>; triggers: Record<string, unknown>; tools: Record<string, unknown> }

const call = async (init?: RequestInit): Promise<Config> => {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  const body = (await res.json()) as { success: boolean; errors: unknown; result: Config }
  if (!body.success) throw new Error(`Zaraz の設定の ${init?.method ?? 'GET'} が失敗: ${res.status} ${JSON.stringify(body.errors)}`)
  return body.result
}

// key の順に左右されないよう並べてから比べる
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

const current = await call()
const next: Config = {
  ...current,
  historyChange: managed.historyChange,
  settings: { ...current.settings, ...managed.settings },
  triggers: { ...current.triggers, ...managed.triggers },
  tools: managed.tools,
}
const changed = ['historyChange', 'settings', 'triggers', 'tools'].filter((k) => !same(current[k], next[k]))
if (changed.length === 0) {
  console.log('Zaraz の設定は zaraz.json と同じ')
} else if (process.argv.includes('--check')) {
  console.error(`Zaraz の設定が zaraz.json と違う: ${changed.join(', ')}`)
  process.exit(1)
} else {
  await call({ method: 'PUT', body: JSON.stringify(next) })
  console.log(`Zaraz の設定を反映した: ${changed.join(', ')}`)
}
