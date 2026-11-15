// 年度の段の無い分野の頁（/tokyo/shinagawa/fields/fukushi、最新の年度の分野の頁へ 301）と、都道府県自体の分野の頁（/tokyo/2024/fields/fukushi）
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from '../../_loader'

export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, [c.req.param('prefecture') ?? '', c.req.param('name') ?? '', 'fields', c.req.param('field') ?? '']))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
