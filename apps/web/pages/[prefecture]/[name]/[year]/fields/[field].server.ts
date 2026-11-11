// 既定でない年度の分野の頁（/tokyo/shinagawa/2024/fields/fukushi）。既定の年度は年度の段の無い分野の頁へ 301
import { defineHandler, defineHead } from 'void'
import { fieldProps, jurisdictionHead, type JurisdictionProps } from '../../../../../server/pages'

export const loader = defineHandler<JurisdictionProps>((c) => fieldProps(c, `/${c.req.param('prefecture')}/${c.req.param('name')}`, c.req.param('field') ?? '', c.req.param('year') ?? ''))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
