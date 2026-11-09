// ホーム（/）。全自治体の要約と、くわしく見られる自治体（PROFILES のある自治体）を渡し、本文は home/home.tsx が描く。旧トップの紹介は /about
import { defineHandler, defineHead } from 'void'
import type { HomeProps } from '../home/home'
import { PROFILES } from '../jurisdiction/profiles'
import { homeEntries } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'

export type Props = HomeProps

const TITLE = '風土記 — まちのお金、何に使ってる？'
const DESCRIPTION = 'まちのお金、何に使ってる？ 風土記は、自治体が何にいくら使い、どう振り返ったかを、事業ごとにわかりやすく見せるサイトです。ほかのまちと同じ物差しで比べられ、どの数字も出典の資料まで辿れます。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }

export const loader = defineHandler<Props>(async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  // API に繋がらなくても、ほかの使い方への入口は出す
  const entries = await homeEntries(c.env as unknown as Env).catch(() => [])
  const featured = Object.values(PROFILES).flatMap((p) => {
    const e = entries.find((x) => x.code === p.code)
    // 事業評価の載る年度（評価シートの事業がある最新の年度）。頁は #y2024 でその年度を開く
    const evalYear = Math.max(...Object.entries(p.years).flatMap(([y, py]) => (py.projects?.length ? [Number(y)] : [])))
    return e ? [{ code: p.code, name: e.name, path: e.path, vision: p.vision?.text, ...(Number.isFinite(evalYear) ? { evalYear } : {}) }] : []
  })
  return { entries, featured }
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
