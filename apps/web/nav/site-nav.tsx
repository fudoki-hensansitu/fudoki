// 全ページの左に置くサイドバー（shadcn の Sidebar）。サーバーが render.tsx で HTML に書き、nav.tsx（/_app/nav.js）が動かす
import * as React from 'react'
import { HomeIcon, LandmarkIcon, MessageSquareIcon, PlugIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LOGO_G } from '../logo'

export const NAV_SECTIONS = ['jurisdictions'] as const
export type NavSection = (typeof NAV_SECTIONS)[number]
export type SiteNavProps = { active?: NavSection; open: boolean }

const DOCS = 'https://docs.fudoki.dev'
/** 開閉の状態を残す cookie（shadcn の SidebarProvider が書く名前） */
export const SIDEBAR_COOKIE = 'sidebar_state'

const Logo = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 146.2150 40" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
)

const Item = ({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active?: boolean }) => (
  <SidebarMenuItem>
    <SidebarMenuButton render={<a href={href} aria-current={active ? 'page' : undefined} />} isActive={active} tooltip={label}>
      {icon}
      <span>{label}</span>
    </SidebarMenuButton>
  </SidebarMenuItem>
)

const FEEDBACK = `${DOCS}/support`

/** 下へ読み進めている間は隠し、上へ戻したら出す。隠れている間は html に data-nav-hidden を付け、下に固定した入力などが --bottom-nav で下がる */
function useHideOnScroll() {
  const [hidden, setHidden] = React.useState(false)
  React.useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const d = y - last
      if (Math.abs(d) < 6) return
      setHidden(d > 0 && y > 56)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  React.useEffect(() => {
    document.documentElement.toggleAttribute('data-nav-hidden', hidden)
  }, [hidden])
  return hidden
}

/** 幅の狭い画面では、サイドバーの代わりに画面の下へ並べる */
function BottomNav({ active }: { active?: NavSection }) {
  const hidden = useHideOnScroll()
  const items = [
    { href: '/', label: 'ホーム', icon: <HomeIcon /> },
    { href: '/jurisdictions', label: '自治体一覧', icon: <LandmarkIcon />, active: active === 'jurisdictions' },
    { href: '/#mcp', label: 'MCP', icon: <PlugIcon /> },
    { href: FEEDBACK, label: 'フィードバック', icon: <MessageSquareIcon /> },
  ]
  return (
    <nav
      aria-label="サイト"
      data-hidden={hidden || undefined}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out data-hidden:translate-y-full md:hidden"
    >
      <ul className="grid h-14 grid-cols-4">
        {items.map((i) => (
          <li key={i.href}>
            <a
              href={i.href}
              aria-current={i.active ? 'page' : undefined}
              className="flex h-full flex-col items-center justify-center gap-0.5 text-[11px] leading-none text-muted-foreground aria-[current=page]:text-primary [&_svg]:size-5"
            >
              {i.icon}
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function SiteNav({ active, open }: SiteNavProps) {
  return (
    <TooltipProvider>
      {/* 頁の本文は島の外にあるので、provider の枠は箱を作らず（contents）、幅の変数だけを配る */}
      <SidebarProvider defaultOpen={open} className="contents">
        <BottomNav active={active} />
        <Sidebar collapsible="icon" aria-label="サイト">
          <SidebarHeader className="flex-row items-center justify-between gap-2 p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <a href="/" aria-label="風土記 ホーム" className="ps-1 text-primary group-data-[collapsible=icon]:hidden">
              <Logo className="block h-7 w-auto" />
            </a>
            <SidebarTrigger />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <Item href="/jurisdictions" label="自治体一覧" icon={<LandmarkIcon />} active={active === 'jurisdictions'} />
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <Item href="/#mcp" label="MCP" icon={<PlugIcon />} />
              <Item href={FEEDBACK} label="フィードバック" icon={<MessageSquareIcon />} />
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    </TooltipProvider>
  )
}
