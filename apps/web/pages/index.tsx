import { Home } from '../home/home'
import type { Props } from './index.server'

export default function Index(props: Props) {
  return <Home {...props} />
}
