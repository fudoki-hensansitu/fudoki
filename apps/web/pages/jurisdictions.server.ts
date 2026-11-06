// 自治体一覧（/jurisdictions）。収録のある自治体を、最新の決算の款の和で並べる
import { HTTPException } from 'hono/http-exception'
import { defineHandler, defineHead } from 'void'
import { indexHead } from '../jurisdiction/html'
import type { IndexEntry } from '../jurisdiction/types'
import { indexEntries } from '../server/jurisdiction-routes'
import { unavailable } from '../server/pages'
import type { Env } from '../server/env'

export type Props = { entries: IndexEntry[] }

export const loader = defineHandler<Props>(async (c) => {
  try {
    return { entries: await indexEntries(c.env as unknown as Env) }
  } catch {
    throw new HTTPException(502, { res: unavailable() })
  }
})

export const head = defineHead<Props>((_c, props) => indexHead(props.entries))
