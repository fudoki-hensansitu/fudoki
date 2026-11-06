import { IndexPage } from '../jurisdiction/index-page'
import type { Props } from './jurisdictions.server'

export default function Jurisdictions({ map, table }: Props) {
  return (
    <main id="j-index">
      <IndexPage map={map} initial={table} />
    </main>
  )
}
