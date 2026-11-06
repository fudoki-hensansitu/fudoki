// 入口の1枚（/）。Turnstile の site key だけを渡し、本文は landing/landing.tsx が描く
import { defineHandler, defineHead } from 'void'
import { siteKey } from '../server/pages'

export type Props = { sitekey: string }

const TITLE = '風土記（fudoki）— 町の家計簿'
const DESCRIPTION = '日本の自治体の支出の予算と決算を事業ごとに集め、AI から問い合わせられるデータとして配る。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }

export const loader = defineHandler<Props>((c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return { sitekey: siteKey(c) }
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
