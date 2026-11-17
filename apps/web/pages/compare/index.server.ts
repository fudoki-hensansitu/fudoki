// まち比べの一覧（/compare）。東京都のまちを、問いごとの小さな地図で塗り分けて並べる。カードを押すと問いの頁（/compare/<問い>）へ
import { defineHandler, defineHead } from 'void'
import { loadCompareMap, type CompareMap } from '../../server/compare-map'
import type { Env } from '../../server/env'

export type Props = { map: CompareMap; failed: boolean }

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  try {
    return { map: await loadCompareMap(env), failed: false }
  } catch {
    // 読めなかった頁は CDN に残さない（直ったあとも1時間エラーが出続けるため）
    c.header('x-revalidate', '0')
    return { map: { prefecture: '', cols: 0, rows: 0, year: null, towns: [] }, failed: true }
  }
})

export const head = defineHead(() => ({
  title: 'まち比べ — 風土記',
  meta: [{ name: 'description', content: 'まちのお金を1人あたりの金額に直して、借金・貯金・分野ごとの使い方などを、東京都のまちどうしで比べられます。' }],
}))
