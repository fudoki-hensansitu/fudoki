// 年度の分野の頁（/tokyo/shinagawa/2024/fields/fukushi）
import { defineHandler, defineHead } from 'void'
import { fieldProps, jurisdictionHead, type JurisdictionProps } from '../../../../../server/pages'

export const loader = defineHandler<JurisdictionProps>((c) => fieldProps(c, `/${c.req.param('prefecture')}/${c.req.param('name')}`, c.req.param('field') ?? '', c.req.param('year') ?? ''))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
