// 市区町村の年度の頁（/tokyo/nakano/2024）・年度の段の無いタブの頁（/tokyo/nakano/projects、最新の年度へ 301）と、
// 都道府県自体の年度のタブの頁（/tokyo/2024/projects）。段の読み分けは routeProps
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, routeProps, type JurisdictionProps } from '../_loader'

export const loader = defineHandler<JurisdictionProps>((c) => routeProps(c, ['prefecture', 'name', 'year'].map((k) => c.req.param(k) ?? '')))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
