import { JurisdictionView } from '../../../../jurisdiction/view'
import type { JurisdictionProps } from '../../../../server/pages'

export default function JurisdictionField(props: JurisdictionProps) {
  return <JurisdictionView {...props} />
}
