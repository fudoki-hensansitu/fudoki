// ホーム（/）。全自治体の要約と、くわしく見られる自治体（PROFILES のある自治体）を渡し、本文は home/home.tsx が描く
import { defineHandler, defineHead } from 'void'
import type { HomeProps } from '../home/home'
import { PROFILES } from '../jurisdiction/profiles'
import { homeEntries } from '../server/jurisdiction-routes'
import { siteKey } from '../server/pages'
import type { Env } from '../server/env'

export type Props = HomeProps

const TITLE = '風土記（fudoki）— うちのまち、なにしてる？'
const DESCRIPTION = 'まちが何を決めて、何をしているかを、出典つきで誰でも見られる形に。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }
/** くわしい頁（PROFILES）で見られる節 */
const SECTIONS = ['区の仕事', '新しく始めること', 'お金の使い道', 'やめたこと']

export const loader = defineHandler<Props>(async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  // API に繋がらなくても、アシスタントと AI からの使い方は出す
  const entries = await homeEntries(c.env as unknown as Env).catch(() => [])
  const featured = Object.values(PROFILES).flatMap((p) => {
    const e = entries.find((x) => x.code === p.code)
    return e ? [{ code: p.code, name: e.name, path: e.path, vision: p.vision?.text, sections: SECTIONS }] : []
  })
  return { sitekey: siteKey(c), entries, featured }
})

export const head = defineHead(() => ({
  title: TITLE,
  meta: [
    { name: 'description', content: DESCRIPTION },
    { property: 'og:title', content: TITLE },
    { property: 'og:description', content: DESCRIPTION },
    { property: 'og:url', content: 'https://fudoki.dev/' },
  ],
  link: [{ rel: 'canonical', href: 'https://fudoki.dev/' }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ORGANIZATION) }],
}))
