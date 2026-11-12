// 都道府県自体の頁（/tokyo）。都道府県の slug でなければ 404
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from './_loader'

// CDN（Void の ISR）に置く秒数（_loader.ts の PAGE_CACHE の下の説明）
export const revalidate = 3600
export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, [c.req.param('prefecture') ?? '']))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
