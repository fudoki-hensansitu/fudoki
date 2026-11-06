import { SessionPage } from '../../chat/session-page'
import { JurisdictionView } from '../../jurisdiction/view'
import type { Props } from './[name].server'

export default function Jurisdiction(props: Props) {
  return props.kind === 'session' ? <SessionPage id={props.id} /> : <JurisdictionView {...props} />
}
