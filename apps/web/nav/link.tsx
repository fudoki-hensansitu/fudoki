// site の中の頁へ移る Link。Void の Link は既定で先読みしないので、ここで hover・focus・touchstart の時点から先読みを始める。
// 先読みは移り先の頁の JSON と JS の chunk を取り、30秒持つ（@void/react の既定）。押した時にはもう揃っているので、待つのは描画だけになる
import * as React from 'react'
import { Link as VoidLink } from '@void/react'

export function Link(props: React.ComponentProps<typeof VoidLink>) {
  return <VoidLink prefetch {...props} />
}
