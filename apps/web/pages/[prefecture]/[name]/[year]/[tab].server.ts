// 年度のタブの頁（/tokyo/shinagawa/2024/projects）。ルーターは /tokyo/shinagawa/fields/fukushi（最新の年度の分野の頁へ 301）と
// 都道府県自体の分野の頁（/tokyo/2024/fields/fukushi）もここへ当てることがある。段の読み分けは routeProps
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from '../../_loader'

// CDN（Void の ISR）に置く秒数（_loader.ts の PAGE_CACHE の下の説明）
export const revalidate = 3600
export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, ['prefecture', 'name', 'year', 'tab'].map((k) => c.req.param(k) ?? '')))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
