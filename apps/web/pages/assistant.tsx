import { AssistantHome } from '../chat/assistant-home'
import type { Props } from './assistant.server'

export default function Assistant({ sitekey }: Props) {
  return <AssistantHome sitekey={sitekey} />
}
