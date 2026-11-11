// ホーム（/）。全自治体の要約と、くわしく見られる自治体（事業評価か都市像のある自治体）を渡し、本文は home/home.tsx が描く。旧トップの紹介は /about
import { defineHandler, defineHead } from 'void'
import type { HomeProps } from '../home/home'
import { VISIONS } from '../jurisdiction/visions'
import { catalog, homeEntries, pageYearsOf } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'

export type Props = HomeProps

const TITLE = '風土記 — まちのお金、何に使ってる？'
const DESCRIPTION = 'まちのお金、何に使ってる？ 風土記は、自治体が何にいくら使い、どう振り返ったかを、事業ごとにわかりやすく見せるサイトです。ほかのまちと同じ物差しで比べられ、出典の資料まで辿れます。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }

export const loader = defineHandler<Props>(async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  // API に繋がらなくても、ほかの使い方への入口は出す
  const env = c.env as unknown as Env
  const [entries, jurisdictions] = await Promise.all([homeEntries(env).catch(() => []), catalog(env).catch(() => [])])
  // 事業評価のある自治体を先に並べる。評価の年度は、自治体の頁で選べる年度のうち評価を収録した最新の年度
  const featured = jurisdictions
    .filter((j) => j.evaluationYears.length > 0 || VISIONS[j.code])
    .sort((a, b) => Number(b.evaluationYears.length > 0) - Number(a.evaluationYears.length > 0))
    .flatMap((j) => {
      const e = entries.find((x) => x.code === j.code)
      const years = pageYearsOf(j)
      const evalYear = j.evaluationYears.filter((y) => years.includes(y)).at(-1)
      return e ? [{ code: j.code, name: e.name, path: e.path, vision: VISIONS[j.code]?.text, ...(evalYear !== undefined ? { evalYear } : {}) }] : []
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
