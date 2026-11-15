// 見つからない頁（404）。middleware/01.site.ts が、頁の無い path・自治体の頁の loader が 404 にした path の HTML の要求をここへ rewrite し、状態を 404 にして返す
import { defineHandler, defineHead } from 'void'

export const loader = defineHandler((c) => {
  c.header('Cache-Control', 'no-store')
  return {}
})

export const head = defineHead(() => ({
  title: '頁が見つかりません — 風土記',
  meta: [{ name: 'robots', content: 'noindex' }],
}))
