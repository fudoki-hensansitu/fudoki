// 手元の保存を消してホームへ戻す（/reset）。はじめての流れ・ツアーを見直すためのデバッグ用で、画面からはリンクしない
import { defineHandler, defineHead } from 'void'

export const loader = defineHandler((c) => {
  c.header('Cache-Control', 'no-store')
  return {}
})

export const head = defineHead(() => ({
  title: 'リセット — 風土記',
  meta: [{ name: 'robots', content: 'noindex' }],
}))
