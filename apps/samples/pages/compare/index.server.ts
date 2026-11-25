// まち比べの一覧（/compare）。東京都のまちを、問いごとの小さな地図で塗り分けて並べる。カードを押すと問いの頁（/compare/<問い>）へ
import { defineHandler, defineHead } from 'void'
import type { CompareMap } from '@fudoki/fiscal/compare'
import { BASE, FUDOKI_ORIGIN } from '../../compare/lib/site'
import { EMPTY_MAP, loadCompareMap } from '../../compare/server/map'
import type { Env } from '../../server/fudoki'

export type Props = { map: CompareMap; failed: boolean }

export const loader = defineHandler<Props>(async (c) => {
  try {
    return { map: await loadCompareMap(c.env as unknown as Env, c.req.raw.headers), failed: false }
  } catch {
    return { map: EMPTY_MAP, failed: true }
  }
})

const TITLE = 'まち比べ — 風土記'
const DESCRIPTION = 'まちのお金を1人あたりの金額に直して、借金・貯金・分野ごとの使い方などを、東京都のまちどうしで比べられます。'
const CANONICAL = `${FUDOKI_ORIGIN}${BASE}`

export const head = defineHead(() => ({
  title: TITLE,
  link: [{ rel: 'canonical', href: CANONICAL }],
  meta: [
    { name: 'description', content: DESCRIPTION },
    { property: 'og:title', content: TITLE },
    { property: 'og:description', content: DESCRIPTION },
    { property: 'og:url', content: CANONICAL },
  ],
}))
