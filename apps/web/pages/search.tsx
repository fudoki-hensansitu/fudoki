import { useEffect } from 'react'
import { Search } from '../search/search'
import { resetScroll, trackSearch } from '../analytics/zaraz'
import type { Props } from './search.server'

export default function SearchPage(props: Props) {
  // 言葉・範囲（code）だけが変わる移動は layout の path が変わらないので、ここでスクロールを数え直す
  useEffect(resetScroll, [props.q, props.code])
  useEffect(() => trackSearch(props.q), [props.q])
  return <Search {...props} />
}
