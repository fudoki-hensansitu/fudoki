import '../landing/landing.css'
import { Landing } from '../landing/landing'
import type { Props } from './about.server'

export default function About({ sitekey }: Props) {
  return <Landing sitekey={sitekey} />
}
