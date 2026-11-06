// 市区町村の頁（/tokyo/nakano）。都道府県の slug でない・名前が違えば 404。
// 会話の画面（/s/:id）も同じ形の URL なので、ここで受ける。Void は動的な経路を pattern の文字の順に当てるので、pages/s/[id] を置いても /:prefecture/:name が先に当たる
import { defineHandler, defineHead } from 'void'
import { jurisdictionHead, jurisdictionProps, SESSION_HEAD, sessionProps, type JurisdictionProps, type SessionProps } from '../../server/pages'

export type Props = JurisdictionProps | SessionProps

export const loader = defineHandler<Props>((c) => {
  const prefecture = c.req.param('prefecture')
  const name = c.req.param('name') ?? ''
  return prefecture === 's' ? sessionProps(c, name) : jurisdictionProps(c, `/${prefecture}/${name}`)
})
export const head = defineHead<Props>((_c, props) => (props.kind === 'session' ? SESSION_HEAD : jurisdictionHead(props)))
