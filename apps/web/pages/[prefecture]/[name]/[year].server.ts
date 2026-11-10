// 市区町村の既定でない年度の頁（/tokyo/nakano/2024）。頁で選べない年度は 404、既定の年度は /tokyo/nakano へ 301
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, jurisdictionProps, type JurisdictionProps } from '../../../server/pages'

export const loader = defineHandler<JurisdictionProps>((c) => jurisdictionProps(c, `/${c.req.param('prefecture')}/${c.req.param('name')}`, c.req.param('year') ?? ''))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
