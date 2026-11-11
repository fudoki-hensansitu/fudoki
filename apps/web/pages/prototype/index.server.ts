// 試作: アプリのホーム（/prototype）。データはホーム（/）と同じ loader を使う
import { defineHead } from 'void'
export { loader, type Props } from '../index.server'

export const head = defineHead(() => ({ title: 'ホーム（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
