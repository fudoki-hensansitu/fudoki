import { IndexPage } from '../jurisdiction/index-page'
import type { Props } from './jurisdictions.server'

export default function Jurisdictions({ entries }: Props) {
  return (
    <main id="j-index">
      <IndexPage entries={entries} />
    </main>
  )
}
