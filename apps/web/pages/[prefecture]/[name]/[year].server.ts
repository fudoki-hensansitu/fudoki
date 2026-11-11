// 市区町村の年度の頁（/tokyo/nakano/2024）と、年度の段の無いタブの頁（/tokyo/nakano/projects、最新の年度の /tokyo/nakano/2026/projects へ 301）。
// 段が4桁の数字なら年度、タブの名前ならタブ。頁で選べない年度は 404
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, jurisdictionProps, tabProps, YEAR_SEGMENT, type JurisdictionProps } from '../_loader'

export const loader = defineHandler<JurisdictionProps>((c) => {
  const path = `/${c.req.param('prefecture')}/${c.req.param('name')}`
  const segment = c.req.param('year') ?? ''
  return YEAR_SEGMENT.test(segment) ? jurisdictionProps(c, path, segment) : tabProps(c, path, segment)
})
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
