// 紹介の頁（/about）をサイドバーごと HTML に描き、標準出力へ書く。build:font（明朝の subset）が読む
//   bun landing/text.tsx
import { renderToString } from 'react-dom/server'
import { SiteNav } from '../nav/site-nav'
import { Landing } from './landing'

process.stdout.write(renderToString(<><SiteNav open /><Landing /></>))
