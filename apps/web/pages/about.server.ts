// 風土記について（/about）。本文は landing/landing.tsx が描く
import { defineHandler, defineHead } from 'void'

const TITLE = '風土記について｜自治体の予算・決算を事業ごとに'
const DESCRIPTION = '住んでいるまちが何にいくら使っているかを、予算書を開かずに事業ごとに。ほかのまちと比べられ、数字は資料の頁まで辿れます。登録なし・無料。'
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
