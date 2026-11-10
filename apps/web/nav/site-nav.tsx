// 全ページの左に置くサイドバー（shadcn の Sidebar）。pages/layout.tsx が置き、頁の間を移っても描き直さない
import * as React from 'react'
import { Link } from './link'
import { BankIcon, ChatIcon, CircleHalfIcon, DesktopIcon, GearSixIcon, GithubLogoIcon, HouseIcon, MoonIcon, PlugIcon, RobotIcon, SidebarSimpleIcon, SunIcon, XLogoIcon } from '@phosphor-icons/react'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { LOGO_G, LOGO_WIDTH } from '../logo'
import { FEEDBACK } from './feedback'
import { applyTheme, type Theme } from './theme'

export const NAV_SECTIONS = ['home', 'jurisdictions', 'assistant'] as const
export type NavSection = (typeof NAV_SECTIONS)[number]
export type SiteNavProps = { active?: NavSection; open: boolean; theme: Theme }
/** site の中の頁へは Void の Link で頁を読み直さずに移り、外（docs・mail・SNS）へは普通の a で出る */
function NavLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  if (props.href.startsWith('https://')) return <a target="_blank" rel="noopener" {...props} />
  if (!props.href.startsWith('/')) return <a {...props} />
  // Void の Link の型は a と button の属性の交差なので、a の属性だけを渡すと event handler の型が合わない。描くのは a なので型だけ合わせる
  return <Link {...(props as React.ComponentProps<typeof Link>)} />
}

const DOCS = 'https://docs.fudoki.dev'
/** 開閉の状態を残す cookie（shadcn の SidebarProvider が書く名前） */
export const SIDEBAR_COOKIE = 'sidebar_state'

const Logo = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${LOGO_WIDTH} 40`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
)

/** ロゴの左のマークだけ（LOGO_G の左端、y=4 から 32×32 を切り出す） */
export const Mark = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 4 32 32" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
)

/** 閉じているときの頭。マークを出し、hover・focus で開く icon に替える */
function CollapsedToggle() {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="メニューを開く"
      className="group/toggle relative hidden size-10 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none group-data-[collapsible=icon]:flex"
    >
      <Mark className="size-7 text-primary group-hover/toggle:opacity-0 group-focus-visible/toggle:opacity-0" />
      <SidebarSimpleIcon className="absolute size-5 opacity-0 group-hover/toggle:opacity-100 group-focus-visible/toggle:opacity-100" />
    </button>
  )
}

/** サイドバーの項目。icon は shadcn の既定より一回り大きくし、閉じて icon だけのときだけ名前を tooltip で出す */
const Item = ({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active?: boolean }) => {
  const { state, isMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink href={href} aria-current={active ? 'page' : undefined} />}
        isActive={active}
        tooltip={state === 'collapsed' && !isMobile ? label : undefined}
        className="h-10 gap-3 px-3 text-sm group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-2.5! [&_svg]:size-5"
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: '端末に合わせる', icon: <DesktopIcon /> },
  { value: 'light', label: 'ライト', icon: <SunIcon /> },
  { value: 'dark', label: 'ダーク', icon: <MoonIcon /> },
]

/** テーマ（ライト・ダーク・端末に合わせる）を選ぶ。項目の見た目は他のサイドバーの項目と同じにし、押すと上に選択肢を開く */
function ThemeItem({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) {
  const { state, isMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <SidebarMenuButton
          render={<DropdownMenuTrigger />}
          tooltip={state === 'collapsed' && !isMobile ? 'テーマ' : undefined}
          className="h-10 gap-3 px-3 text-sm group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-2.5! [&_svg]:size-5"
        >
          <CircleHalfIcon />
          <span>テーマ</span>
        </SidebarMenuButton>
        <DropdownMenuContent side={state === 'collapsed' ? 'right' : 'top'} align="start" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>テーマ</DropdownMenuLabel>
          </DropdownMenuGroup>
          <ThemeChoices theme={theme} onPick={onPick} />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

const ThemeChoices = ({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) => (
  <DropdownMenuRadioGroup value={theme} onValueChange={(v) => onPick(v as Theme)}>
    {THEME_OPTIONS.map((o) => (
      <DropdownMenuRadioItem key={o.value} value={o.value} className="gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {o.icon}
        {o.label}
      </DropdownMenuRadioItem>
    ))}
  </DropdownMenuRadioGroup>
)

const MCP = `${DOCS}/mcp`
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'
/** 風土記の X アカウント。空にすると icon を出さない */
const X = 'https://x.com/fudokijp'

const Social = ({ href, label, icon, className }: { href: string; label: string; icon: React.ReactNode; className?: string }) => (
  <a href={href} aria-label={label} target="_blank" rel="noopener noreferrer" className={cn('flex size-10 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-5', className)}>
    {icon}
  </a>
)

const BOTTOM_ITEM = 'flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] leading-none text-muted-foreground aria-[current=page]:text-primary data-popup-open:text-foreground [&_svg]:size-5'

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

/** 下の帯に入らないもの（テーマ・MCP・フィードバック・X・GitHub）をまとめる設定のメニュー */
function SettingsMenu({ theme, onPick, className }: { theme: Theme; onPick: (t: Theme) => void; className: string }) {
  const links = [
    { href: MCP, label: 'MCP', icon: <PlugIcon /> },
    { href: FEEDBACK, label: 'フィードバック', icon: <ChatIcon /> },
    ...(X ? [{ href: X, label: 'X', icon: <XLogoIcon /> }] : []),
    { href: GITHUB, label: 'GitHub', icon: <GithubLogoIcon /> },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={className}>
        <GearSixIcon />
        設定
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>テーマ</DropdownMenuLabel>
        </DropdownMenuGroup>
        <ThemeChoices theme={theme} onPick={onPick} />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {links.map((l) => (
            <DropdownMenuItem key={l.label} render={<a href={l.href} target="_blank" rel="noopener noreferrer" />} className="gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
              {l.icon}
              {l.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 幅の狭い画面では、サイドバーの代わりに画面の下へ並べる。入らないものは「設定」にまとめる */
function BottomNav({ active, theme, onPick }: { active?: NavSection; theme: Theme; onPick: (t: Theme) => void }) {
  const [hidden, setHidden] = useHideOnScroll()
  const items = [
    { href: '/', label: 'ホーム', icon: <HouseIcon />, active: active === 'home' },
    { href: '/jurisdictions', label: '自治体一覧', icon: <BankIcon />, active: active === 'jurisdictions' },
    { href: '/assistant', label: 'アシスタント', icon: <RobotIcon />, active: active === 'assistant' },
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
            <NavLink
              href={i.href}
              aria-current={i.active ? 'page' : undefined}
              className={BOTTOM_ITEM}
            >
              {i.icon}
              {i.label}
            </NavLink>
          </li>
        ))}
        <li>
          <SettingsMenu theme={theme} onPick={onPick} className={BOTTOM_ITEM} />
        </li>
      </ul>
    </nav>
  )
}

export function SiteNav({ active, open, theme: initialTheme }: SiteNavProps) {
  const [theme, setTheme] = React.useState(initialTheme)
  const pickTheme = (t: Theme) => {
    setTheme(t)
    applyTheme(t)
  }
  return (
    <TooltipProvider>
      {/* 頁の本文は provider の外（.site-main）にあるので、provider の枠は箱を作らず（contents）、幅の変数だけを配る */}
      <SidebarProvider defaultOpen={open} className="contents" style={{ '--sidebar-width': '13rem', '--sidebar-width-icon': '3.5rem' } as React.CSSProperties}>
        <BottomNav active={active} theme={theme} onPick={pickTheme} />
        <Sidebar collapsible="icon" aria-label="サイト">
          <SidebarHeader className="flex-row items-center justify-between gap-2 px-3 pt-5 pb-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <NavLink href="/" aria-label="風土記 ホーム" className="ps-2 group-data-[collapsible=icon]:hidden">
              {/* 色は svg に付ける（a { color: inherit } に負けて黒くならないように） */}
              <Logo className="block h-7 w-auto text-primary" />
            </NavLink>
            <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
            <CollapsedToggle />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <Item href="/jurisdictions" label="自治体一覧" icon={<BankIcon />} active={active === 'jurisdictions'} />
                <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={active === 'assistant'} />
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="gap-0 px-2 pt-2 pb-12">
            <SidebarMenu>
              <ThemeItem theme={theme} onPick={pickTheme} />
              <Item href={MCP} label="MCP" icon={<PlugIcon />} />
              <Item href={FEEDBACK} label="フィードバック" icon={<ChatIcon />} />
            </SidebarMenu>
            {/* 末端に X と GitHub。閉じて icon だけのときは X だけ残す */}
            <div className="flex justify-center gap-1">
              {X ? <Social href={X} label="X" icon={<XLogoIcon />} /> : null}
              <Social href={GITHUB} label="GitHub" icon={<GithubLogoIcon />} className="group-data-[collapsible=icon]:hidden" />
            </div>
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    </TooltipProvider>
  )
}
