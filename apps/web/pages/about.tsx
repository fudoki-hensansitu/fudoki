import '../landing/about.css'
import { Landing } from '../landing/landing'
import type { Props } from './about.server'

export default function About({ count }: Props) {
  return <Landing count={count} />
}
