// 年度の分野の頁（/tokyo/shinagawa/2024/fields/fukushi）
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from '../../../_loader'

// CDN（Void の ISR）に置く秒数（_loader.ts の PAGE_CACHE の下の説明）
export const revalidate = 3600
export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, [c.req.param('prefecture') ?? '', c.req.param('name') ?? '', c.req.param('year') ?? '', 'fields', c.req.param('field') ?? '']))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
