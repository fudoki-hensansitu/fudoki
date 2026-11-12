// 全頁に共通する枠。左のサイドバー（狭い画面では下の帯）を置き、頁の間を移っても描き直さずに本文（.site-main）だけを差し替える
import '../styles/app.css'
import { useRouter } from '@void/react'
import { SiteNav, type NavSection } from '../nav/site-nav'

/** サイドバーで今いる場所として出す項目。ホームは「ホーム」（狭い画面の下の帯だけ）、会話を始める頁と会話（/s/:id）は「アシスタント」 */
const sectionOf = (path: string): NavSection | undefined => {
  if (path === '/') return 'home'
  if (path === '/search') return 'search'
  if (path === '/assistant' || path.startsWith('/s/')) return 'assistant'
  return undefined
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { path } = useRouter()
  return (
    <div className="site">
      <div id="site-nav">
        <SiteNav active={sectionOf(path)} />
      </div>
      <div className="site-main">{children}</div>
    </div>
  )
}
