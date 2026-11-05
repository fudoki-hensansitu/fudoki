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
  useSidebar,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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

/** サイドバーの項目。字と icon は shadcn の既定より一回り大きくし、閉じて icon だけのときだけ名前を tooltip で出す */
const Item = ({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active?: boolean }) => {
  const { state, isMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<a href={href} aria-current={active ? 'page' : undefined} />}
        isActive={active}
        tooltip={state === 'collapsed' && !isMobile ? label : undefined}
        className="h-10 gap-3 px-3 text-[15px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-2.5! [&_svg]:size-5"
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** お問い合わせ（入口の頁の下）と同じく、メールを開いてもらう */
const FEEDBACK = 'mailto:support@fudoki.dev'
const MCP = `${DOCS}/mcp`
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'
/** 風土記の X アカウント。決まるまでは空で、icon を出さない */
const X = ''

// ブランドのロゴ（Simple Icons の形）。lucide にはブランドの icon が無い
const XIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>
)
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
)
const Social = ({ href, label, icon, className }: { href: string; label: string; icon: React.ReactNode; className?: string }) => (
  <a href={href} aria-label={label} target="_blank" rel="noopener noreferrer" className={cn('flex size-10 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-[18px]', className)}>
    {icon}
  </a>
)

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
  return [hidden, setHidden] as const
}

/** 幅の狭い画面では、サイドバーの代わりに画面の下へ並べる */
function BottomNav({ active }: { active?: NavSection }) {
  const [hidden, setHidden] = useHideOnScroll()
  const items = [
    { href: '/', label: 'ホーム', icon: <HomeIcon /> },
    { href: '/jurisdictions', label: '自治体一覧', icon: <LandmarkIcon />, active: active === 'jurisdictions' },
    { href: MCP, label: 'MCP', icon: <PlugIcon /> },
    { href: FEEDBACK, label: 'フィードバック', icon: <MessageSquareIcon /> },
  ]
  return (
    <nav
      aria-label="サイト"
      data-hidden={hidden || undefined}
      // 隠れている間も link は tab 順に残るので、focus が入ったら出す
      onFocus={() => setHidden(false)}
      className="fixed inset-x-0 bottom-0 z-40 bg-sidebar pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out motion-reduce:transition-none data-hidden:translate-y-full md:hidden"
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
      <SidebarProvider defaultOpen={open} className="contents" style={{ '--sidebar-width': '13rem', '--sidebar-width-icon': '3.5rem' } as React.CSSProperties}>
        <BottomNav active={active} />
        {/* 地の色で本文と分かれるので、境の線は引かない */}
        <Sidebar collapsible="icon" aria-label="サイト" className="group-data-[side=left]:border-r-0">
          <SidebarHeader className="flex-row items-center justify-between gap-2 px-3 pt-5 pb-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <a href="/" aria-label="風土記 ホーム" className="ps-2 group-data-[collapsible=icon]:hidden">
              {/* 色は svg に付ける（入口の頁の a { color: inherit } に負けて黒くならないように） */}
              <Logo className="block h-7 w-auto text-primary" />
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
          <SidebarFooter className="px-2 pt-2 pb-12">
            <SidebarMenu>
              <Item href={MCP} label="MCP" icon={<PlugIcon />} />
              <Item href={FEEDBACK} label="フィードバック" icon={<MessageSquareIcon />} />
            </SidebarMenu>
            {/* 末端に X と GitHub。閉じて icon だけのときは X だけ残す */}
            <div className="flex gap-1 px-1 pt-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              {X ? <Social href={X} label="X" icon={<XIcon />} /> : null}
              <Social href={GITHUB} label="GitHub" icon={<GitHubIcon />} className="group-data-[collapsible=icon]:hidden" />
            </div>
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    </TooltipProvider>
  )
}
