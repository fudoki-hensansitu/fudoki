// まち比べの一覧（/compare）。東京都のまちを、問いごとの小さな地図で塗り分けて並べる。カードを押すと問いの頁（/compare/<問い>）へ
import { defineHandler, defineHead } from 'void'
import { loadCompareMap, type CompareMap } from '../../server/compare-map'
import type { Env } from '../../server/env'

export type Props = { map: CompareMap; failed: boolean }

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  try {
    const map = await loadCompareMap(env)
    // 一部を読めなかった頁は CDN に残さない（直ったあとも1時間欠けたまま出続けるため）
    if (map.partial) c.header('x-revalidate', '0')
    return { map, failed: false }
  } catch {
    // 読めなかった頁は CDN に残さない（直ったあとも1時間エラーが出続けるため）
    c.header('x-revalidate', '0')
    return { map: { prefecture: '', cols: 0, rows: 0, year: null, towns: [], partial: false }, failed: true }
  }
})

export const head = defineHead(() => ({
  title: 'まち比べ — 風土記',
  link: [{ rel: 'canonical', href: 'https://fudoki.dev/compare' }],
  meta: [{ name: 'description', content: 'まちのお金を1人あたりの金額に直して、借金・貯金・分野ごとの使い方などを、東京都のまちどうしで比べられます。' }],
}))
