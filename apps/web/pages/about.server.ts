// このサイトについて（/about）。本文は landing/landing.tsx が描く
import { defineHandler, defineHead } from 'void'

const TITLE = '風土記について — 自治体の行政を、わかりやすく'
const DESCRIPTION = '風土記は、自治体の行政が何を決め、何にいくら使い、どう振り返ったかを、わかりやすく見せるサイトです。計画・予算・決算・事業評価を中心に、議会・選挙も載せます。ほかの自治体と同じ物差しで比べられ、どの数字も出典の資料まで辿れます。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }

export const loader = defineHandler((c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return {}
})

export const head = defineHead(() => ({
  title: TITLE,
  meta: [
    { name: 'description', content: DESCRIPTION },
    { property: 'og:title', content: TITLE },
    { property: 'og:description', content: DESCRIPTION },
    { property: 'og:url', content: 'https://fudoki.dev/about' },
  ],
  link: [{ rel: 'canonical', href: 'https://fudoki.dev/about' }],
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ORGANIZATION) }],
}))
