// 試作: アプリのホーム（/prototype）。データはホーム（/）と同じで、まちの中で質問する案のために Turnstile の site key を足す
import { defineHandler, defineHead } from 'void'
import { homeData, type Props as HomeProps } from '../index.server'
import { siteKey } from '../../server/site-key'

export type Props = HomeProps & { sitekey: string }

export const loader = defineHandler<Props>(async (c) => ({ ...(await homeData(c)), sitekey: siteKey(c) }))

export const head = defineHead(() => ({ title: 'ホーム（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
