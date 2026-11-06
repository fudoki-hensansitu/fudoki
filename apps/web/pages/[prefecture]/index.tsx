import { JurisdictionView } from '../../jurisdiction/view'
import type { JurisdictionProps } from '../../server/pages'

export default function Jurisdiction(props: JurisdictionProps) {
  return <JurisdictionView {...props} />
}
