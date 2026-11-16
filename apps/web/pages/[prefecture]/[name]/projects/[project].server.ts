// 年度の段の無い事業の頁（/tokyo/shinagawa/projects/<project_id>、最新の年度の事業の頁へ 301）と、都道府県自体の事業の頁（/tokyo/2024/projects/<project_id>）
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from '../../_loader'

export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, [c.req.param('prefecture') ?? '', c.req.param('name') ?? '', 'projects', c.req.param('project') ?? '']))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
