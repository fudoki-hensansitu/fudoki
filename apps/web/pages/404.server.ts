// 見つからない頁（404）。middleware/01.site.ts が、頁の無い path・自治体の頁の loader が 404 にした path の HTML の要求をここへ rewrite し、状態を 404 にして返す。
// 自治体の頁の下（/tokyo/shinagawa/1999）なら、その自治体（無ければ都道府県）の頁への導線を出す
import { defineHandler, defineHead } from 'void'
import { codeOfPath, jurisdictionPath } from '../jurisdiction/path'
import { loadCatalogEntry } from '../server/jurisdiction'
import type { Env } from '../server/env'

export type Props = {
  /** 開こうとした path の上にある自治体の頁。無い・API に繋がらなければ null */
  town: { name: string; path: string } | null
}

/** 自治体の名前を待つ上限。過ぎたら導線を出さずに返す */
const TOWN_WAIT_MS = 1500

/** 開こうとした path の上で、頁のある自治体（/tokyo/shinagawa、無ければ /tokyo）。開こうとした path そのものは除く */
async function townAbove(env: Env, path: string): Promise<Props['town']> {
  const segments = path.split('/').filter(Boolean)
  for (const n of [2, 1]) {
    const candidate = `/${segments.slice(0, n).join('/')}`
    const code = segments.length >= n && candidate !== path ? codeOfPath(candidate) : undefined
    if (!code) continue
    const entry = await Promise.race([loadCatalogEntry(env, code), new Promise<null>((r) => setTimeout(() => r(null), TOWN_WAIT_MS))]).catch(() => null)
    if (entry) return { name: entry.name, path: jurisdictionPath(code) }
  }
  return null
}

export const loader = defineHandler<Props>(async (c) => {
  c.header('Cache-Control', 'no-store')
  const original = c.originalUrl()?.pathname
  return { town: original ? await townAbove(c.env as unknown as Env, original) : null }
})

export const head = defineHead(() => ({
  title: '頁が見つかりません — 風土記',
  meta: [{ name: 'robots', content: 'noindex' }],
}))
