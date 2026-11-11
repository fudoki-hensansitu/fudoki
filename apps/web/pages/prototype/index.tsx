import { ProtoHome } from '../../prototype/home'
import type { Props } from './index.server'

export default function ProtoIndex(props: Props) {
  return <ProtoHome {...props} />
}
