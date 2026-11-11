// 会話の画面（/s/:id）の props と head。/:prefecture/:name と同じ形の URL なので pages/[prefecture]/[name].server.ts が読む
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { notFound } from './_loader'

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 会話の画面（/s/:id）の props。会話の履歴と token はブラウザの sessionStorage にだけあり、サーバーは枠だけを返す（保存させない） */
export type SessionProps = { kind: 'session'; id: string }

export function sessionProps(c: Context, id: string): SessionProps {
  if (!SESSION_ID.test(id)) throw new HTTPException(404, { res: notFound() })
  c.header('Cache-Control', 'no-store')
  return { kind: 'session', id }
}

export const SESSION_HEAD = {
  title: '風土記に聞く',
  meta: [
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ],
}
