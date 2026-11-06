import '../landing/landing.css'
import { Landing } from '../landing/landing'
import type { Props } from './index.server'

export default function Home({ sitekey }: Props) {
  return <Landing sitekey={sitekey} />
}
