// 自治体一覧（/jurisdictions）。地図・検索には全自治体の要約を、比較表には1人あたりの歳出の大きい順の最初の30件を載せる（続きは /api/jurisdictions/table）
import { HTTPException } from 'hono/http-exception'
import { defineHandler, defineHead } from 'void'
import { indexHead } from '../jurisdiction/html'
import type { IndexTable, MapEntry } from '../jurisdiction/index-table'
import { indexPageData } from '../server/jurisdiction-routes'
import { PAGE_CACHE, unavailable } from '../server/pages'
import type { Env } from '../server/env'

export type Props = { map: MapEntry[]; table: IndexTable }

export const loader = defineHandler<Props>(async (c) => {
  try {
    const data = await indexPageData(c.env as unknown as Env)
    c.header('Cache-Control', PAGE_CACHE)
    return data
  } catch {
    throw new HTTPException(502, { res: unavailable() })
  }
})

export const head = defineHead<Props>((_c, props) => indexHead(props.map.length))
