// 全頁に共通する枠。左のサイドバー（狭い画面では下の帯）を置き、頁の間を移っても描き直さずに本文（.site-main）だけを差し替える
import '../styles/app.css'
import { useRouter, useShared } from '@void/react'
import { SiteNav, type NavSection } from '../nav/site-nav'
import { INDEX_PATH } from '../jurisdiction/types'
import { PREFECTURE_SLUGS } from '../jurisdiction/path'

/** サイドバーで今いる場所として出す項目。ホームは「ホーム」、自治体の一覧と、都道府県・市区町村の頁は「自治体一覧」、会話を始める頁と会話（/s/:id）は「アシスタント」 */
const sectionOf = (path: string): NavSection | undefined => {
  if (path === '/') return 'home'
  if (path === INDEX_PATH || PREFECTURE_SLUGS.has(path.split('/')[1] ?? '')) return 'jurisdictions'
  if (path === '/assistant' || path.startsWith('/s/')) return 'assistant'
  return undefined
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { navOpen } = useShared()
  const { path } = useRouter()
  return (
    <div className="site">
      <div id="site-nav">
        <SiteNav active={sectionOf(path)} open={navOpen} />
      </div>
      <div className="site-main">{children}</div>
    </div>
  )
}
