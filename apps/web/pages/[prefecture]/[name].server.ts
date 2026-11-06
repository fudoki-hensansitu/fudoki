// 市区町村の頁（/tokyo/nakano）。都道府県の slug でない・名前が違えば 404
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, jurisdictionProps, type JurisdictionProps } from '../../server/pages'

export const loader = defineHandler<JurisdictionProps>((c) => jurisdictionProps(c, `/${c.req.param('prefecture')}/${c.req.param('name')}`))
export const head = defineHead<JurisdictionProps>((_c, props) => jurisdictionHead(props))
