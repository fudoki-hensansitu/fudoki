// このサイトについて（/about）。本文は landing/landing.tsx が描く
import { defineHandler, defineHead } from 'void'

const TITLE = '風土記について — あなたの一票が、まちのお金の使い道になる'
const DESCRIPTION = 'あなたの一票が、まちのお金の使い道になる。風土記は、選挙で選ばれた人が議会で何を決め、自治体が何にいくら使い、どう振り返ったかを、わかりやすく見せるサイトです。ほかの自治体と同じ物差しで比べられ、どの数字も出典の資料まで辿れます。'
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
