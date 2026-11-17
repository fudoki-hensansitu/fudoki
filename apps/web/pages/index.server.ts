// ホーム（/）。自治体の一覧を読めたかと、見本に出す自治体（事業評価か都市像のある自治体）を渡し、本文は home/home.tsx が描く。旧トップの紹介は /about
import { defineHandler, defineHead } from 'void'
import type { HomeProps } from '../home/home'
import { VISIONS } from '../jurisdiction/visions'
import { catalog, homeEntries, pageYearsOf } from '../server/jurisdiction-routes'
import { appYears } from '../server/app-data'
import { reiwa } from '../jurisdiction/types'
import type { Env } from '../server/env'

export type Props = HomeProps

const ORIGIN = 'https://fudoki.dev'
const TITLE = '風土記 — 私のお金はどこへ行った？'
const DESCRIPTION = '私のお金はどこへ行った？ 風土記は、自治体が何にいくら使い、どう振り返ったかを、事業ごとにわかりやすく見せるサイトです。ほかのまちと同じ物差しで比べられ、出典の資料まで辿れます。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }

export const loader = defineHandler<Props>(async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  // API に繋がらなくても頁は返す（一覧が空なら、ホームは「読み込めません」と出す）。その頁は CDN に置かない
  const env = c.env as unknown as Env
  let failed = false
  const fail = () => ((failed = true), [])
  const [entries, jurisdictions] = await Promise.all([homeEntries(env).catch(fail), catalog(env).catch(fail)])
  if (failed) c.header('x-revalidate', '0')
  // 事業評価のある自治体を先に並べる。評価の年度は、自治体の頁で選べる年度のうち評価を収録した最新の年度
  const featured = jurisdictions
    .filter((j) => j.evaluationYears.length > 0 || VISIONS[j.code])
    .sort((a, b) => Number(b.evaluationYears.length > 0) - Number(a.evaluationYears.length > 0))
    .flatMap((j) => {
      const e = entries.find((x) => x.code === j.code)
      const years = pageYearsOf(j)
      const evalYear = j.evaluationYears.filter((y) => years.includes(y)).at(-1)
      return e ? [{ code: j.code, name: e.name, path: e.path, prefecture: e.prefecture, vision: VISIONS[j.code]?.text, ...(evalYear !== undefined ? { evalYear } : {}) }] : []
    })
  // シェアされたレシート（?town=<自治体コード>&year=<年度>）。収録と年度を確かめて渡し、head の OG 画像をそのレシートにする
  const q = new URL(c.req.url)
  const code = q.searchParams.get('town') ?? ''
  const yearText = q.searchParams.get('year') ?? ''
  const j = /^\d{6}$/.test(code) ? jurisdictions.find((x) => x.code === code) : undefined
  const e = j ? entries.find((x) => x.code === code) : undefined
  const years = j ? appYears(j).map((y) => y.year) : []
  const year = /^\d{4}$/.test(yearText) && years.includes(Number(yearText)) ? Number(yearText) : years[0]
  const shared = e && year !== undefined ? { town: { code, name: e.name, path: e.path }, year } : undefined
  // 自治体の一覧そのものは渡さない（名前で探す欄はサーバーに少しずつ聞く）
  return { listed: entries.length > 0, featured, ...(shared ? { shared } : {}) }
})

export const head = defineHead<Props>((_c, props) => {
  const s = props.shared
  // シェアされたレシートは、題と OG 画像をそのまちのレシートにする（canonical はホームのまま）。
  // 人口が無くレシートを描けないまちの画像は、全頁共通の OG 画像へ回す（routes/jurisdictions/[code]/receipt.png.ts）
  const title = s ? `${s.town.name}の1人あたりのレシート（${reiwa(s.year)}）｜風土記` : TITLE
  const shared = s
    ? [
        { property: 'og:image', content: `${ORIGIN}/jurisdictions/${s.town.code}/receipt.png?year=${s.year}` },
        { property: 'og:url', content: `${ORIGIN}/?town=${s.town.code}&year=${s.year}` },
      ]
    : [{ property: 'og:url', content: 'https://fudoki.dev/' }]
  return {
  title,
  meta: [
    { name: 'description', content: DESCRIPTION },
    { property: 'og:title', content: title },
    { property: 'og:description', content: DESCRIPTION },
    ...shared,
  ],
  link: [{ rel: 'canonical', href: 'https://fudoki.dev/' }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ORGANIZATION) }],
  }
})
