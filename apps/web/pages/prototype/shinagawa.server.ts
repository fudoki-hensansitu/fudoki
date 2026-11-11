// 試作: 品川区の頁をアプリ型にしたもの（/prototype/shinagawa）。データは public/prototype/shinagawa.json（本番 API の写し）。検索に載せない
import { defineHandler, defineHead } from 'void'

export const loader = defineHandler(() => ({}))
export const head = defineHead(() => ({ title: '品川区（試作）— 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
