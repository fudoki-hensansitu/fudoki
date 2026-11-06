// アシスタント（/assistant）。サイドバーから風土記の AI との会話を始める頁。Turnstile の site key だけを渡す
import { defineHandler, defineHead } from 'void'
import { siteKey } from '../server/pages'

export type Props = { sitekey: string }

const TITLE = 'アシスタント — 風土記'
const DESCRIPTION = '自治体の予算・決算について、風土記の AI に出典つきで聞けます。'

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
    { property: 'og:url', content: 'https://fudoki.dev/assistant' },
  ],
  link: [{ rel: 'canonical', href: 'https://fudoki.dev/assistant' }],
}))
