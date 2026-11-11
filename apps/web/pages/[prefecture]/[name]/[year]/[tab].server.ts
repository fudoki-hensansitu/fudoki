// 既定でない年度のタブの頁（/tokyo/shinagawa/2024/projects）。既定の年度は年度の段の無いタブの頁へ 301。
// ルーターは /tokyo/shinagawa/fields/fukushi もここへ当てるので、段が fields なら分野の頁にする
import { defineHandler, defineHead } from 'void'
import { fieldProps, jurisdictionHead, tabProps, type JurisdictionProps } from '../../../../server/pages'

export const loader = defineHandler<JurisdictionProps>((c) => {
  const path = `/${c.req.param('prefecture')}/${c.req.param('name')}`
  const year = c.req.param('year') ?? ''
  const tab = c.req.param('tab') ?? ''
  return year === 'fields' ? fieldProps(c, path, tab) : tabProps(c, path, tab, year)
})
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
