// 入口の1枚（/）。Turnstile の site key だけを渡し、本文は landing/landing.tsx が描く
import { defineHandler, defineHead } from 'void'
import { siteKey } from '../server/pages'

export type Props = { sitekey: string }

const TITLE = '風土記（fudoki）— まちを、ひらく'
const DESCRIPTION = '自治体のお金とデータを、誰でも見られて、誰でも書き足せる形にひらく。'
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
