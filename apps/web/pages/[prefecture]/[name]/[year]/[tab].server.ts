// 既定でない年度のタブの頁（/tokyo/shinagawa/2024/projects）。既定の年度は年度の段の無いタブの頁へ 301
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, tabProps, type JurisdictionProps } from '../../../../server/pages'

export const loader = defineHandler<JurisdictionProps>((c) => tabProps(c, `/${c.req.param('prefecture')}/${c.req.param('name')}`, c.req.param('tab') ?? '', c.req.param('year') ?? ''))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
