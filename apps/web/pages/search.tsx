import { useEffect } from 'react'
import { Search } from '../search/search'
import { trackSearch } from '../analytics/zaraz'
import type { Props } from './search.server'

export default function SearchPage(props: Props) {
  useEffect(() => trackSearch(props.q), [props.q])
  return <Search {...props} />
}
