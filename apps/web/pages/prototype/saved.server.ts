// 試作: 追っている事業（/prototype/saved）。中身はブラウザに置くので、loader は持たない
import { defineHead } from 'void'

export const head = defineHead(() => ({ title: '追っている事業（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
