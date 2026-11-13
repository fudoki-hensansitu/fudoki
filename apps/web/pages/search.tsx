import { useEffect } from 'react'
import { Search } from '../search/search'
import { resetScroll, trackSearch } from '../analytics/zaraz'
import type { Props } from './search.server'

export default function SearchPage(props: Props) {
  // 言葉だけが変わる移動は layout の path が変わらないので、ここでスクロールも数え直す
  useEffect(() => {
    resetScroll()
    trackSearch(props.q)
  }, [props.q])
  return <Search {...props} />
}
