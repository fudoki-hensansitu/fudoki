// 全頁に共通する枠。上にヘッダーを置き、頁の間を移っても描き直さずに本文（.site-main）だけを差し替える
import '../styles/app.css'
import { useEffect } from 'react'
import { useRouter } from '@void/react'
import { installTracking, resetScroll } from '../analytics/zaraz'
import { SiteHeader } from '../nav/site-header'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { path } = useRouter()
  useEffect(installTracking, [])
  useEffect(resetScroll, [path])
  return (
    <div className="site">
      <SiteHeader />
      <div className="site-main">{children}</div>
    </div>
  )
}
