// 風土記について（/about）。本文は landing/landing.tsx が描く。収録している自治体の数（ホームの検索に載る、決算のある自治体）だけを渡す
import { defineHandler, defineHead } from 'void'
import { homeEntries } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'

export type Props = { count: number | null }

const TITLE = '風土記について｜自治体の予算・決算を事業ごとに'
const DESCRIPTION = '住んでいるまちが何にいくら使っているかを、予算書を開かずに事業ごとに。ほかのまちと比べられ、数字は資料の頁まで辿れます。登録なし・無料。'
const ORGANIZATION = { '@context': 'https://schema.org', '@type': 'Organization', name: '風土記（fudoki）', url: 'https://fudoki.dev/', logo: 'https://fudoki.dev/icon.png', sameAs: ['https://github.com/fudoki-hensansitu', 'https://docs.fudoki.dev/'] }

export const loader = defineHandler<Props>(async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  // API に繋がらなくても頁は返す（数を出さないだけ）。その頁は CDN に置かない
  const list = await homeEntries(c.env as unknown as Env).catch(() => null)
  if (!list) c.header('x-revalidate', '0')
  return { count: list && list.length > 0 ? list.length : null }
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
