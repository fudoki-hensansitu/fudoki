// pages/ の頁に共通する枠。左のサイドバー（狭い画面では下の帯）を置き、頁の間を移っても描き直さずに残す
import '../jurisdiction/jurisdiction.css'
import { Link, useShared } from '@void/react'
import { SiteNav, type PageLink } from '../nav/site-nav'

// Void の Link の型は a と button の属性の交差なので、a の属性だけを渡すとevent handler の型が合わない。描くのは a なので型だけ合わせる
const VoidLink: PageLink = (props) => <Link {...(props as React.ComponentProps<typeof Link>)} />

export default function Layout({ children }: { children: React.ReactNode }) {
  const { navOpen } = useShared()
  return (
    <div className="site">
      <div id="site-nav">
        {/* pages/ の頁は今どれも自治体の頁なので、サイドバーの「自治体一覧」を今いる場所として出す */}
        <SiteNav active="jurisdictions" open={navOpen} pageLink={VoidLink} />
      </div>
      <div className="site-main">{children}</div>
    </div>
  )
}
