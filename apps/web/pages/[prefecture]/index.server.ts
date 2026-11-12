// 都道府県自体の頁（/tokyo）。都道府県の slug でなければ 404
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from './_loader'

export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, [c.req.param('prefecture') ?? '']))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
