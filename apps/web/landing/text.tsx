// 明朝で見出しを組む頁（入口の1枚とアシスタント）を、本番と同じく入力を出した形でサイドバーごと HTML に描き、標準出力へ書く。build:font（明朝の subset）が読む
//   bun landing/text.tsx
import { renderToString } from 'react-dom/server'
import { SiteNav } from '../nav/site-nav'
import { AssistantHome } from '../chat/assistant-home'
import { Landing } from './landing'

process.stdout.write(renderToString(<><SiteNav open /><Landing sitekey="build" /><AssistantHome sitekey="build" /></>))
