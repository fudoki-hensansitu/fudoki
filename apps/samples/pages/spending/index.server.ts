// トップ（/spending）。まちを選ぶ札だけ。データは読まない
import { defineHead } from 'void'
import { BASE, SITE_ORIGIN } from '../../spending/lib/fudoki'
import { DESCRIPTION } from '../../spending/lib/copy'

const TITLE = '私のお金はどこへ行った？｜風土記'

export const head = defineHead(() => ({
  title: TITLE,
  meta: [
    { name: 'description', content: DESCRIPTION },
    { property: 'og:title', content: TITLE },
    { property: 'og:description', content: DESCRIPTION },
    { property: 'og:url', content: `${SITE_ORIGIN}${BASE}` },
  ],
  link: [{ rel: 'canonical', href: `${SITE_ORIGIN}${BASE}` }],
}))
