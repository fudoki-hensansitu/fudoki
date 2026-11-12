import { Search } from '../search/search'
import type { Props } from './search.server'

export default function SearchPage(props: Props) {
  return <Search {...props} />
}
