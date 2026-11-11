// 年度の段の無い分野の頁（/tokyo/shinagawa/fields/fukushi）。最新の年度の分野の頁へ 301、分野の id が違えば 404
import { defineHandler, defineHead } from 'void'
import { fieldProps, jurisdictionHead, type JurisdictionProps } from '../../_loader'

export const loader = defineHandler<JurisdictionProps>((c) => fieldProps(c, `/${c.req.param('prefecture')}/${c.req.param('name')}`, c.req.param('field') ?? ''))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
