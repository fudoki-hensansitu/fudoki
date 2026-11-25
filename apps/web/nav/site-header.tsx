// 全頁の上に置くヘッダー。ロゴ・まちを探す・MCP・フィードバック・X・GitHub・テーマだけを1本に並べる（2026-11-25 yuito「sidenav を header に」）。
// pages/layout.tsx が置き、頁の間を移っても描き直さない。下へ読み進めている間は上へ隠し、上へ戻したら出す。
// ロゴはホームへ。住んでいるまちを選んだ人のホームはそのまちの頁なので（2026-11-19 yuito「ホームイコール登録した町」）、ロゴはそのまちの頁を直接指し、「私のまち」への戻り口になる
import * as React from 'react'
import { CircleHalfIcon, DesktopIcon, DotsThreeIcon, GithubLogoIcon, MagnifyingGlassIcon, MoonIcon, PlugIcon, SunIcon, XLogoIcon, ChatIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Link } from './link'
import { Logo, Mark } from './brand'
import { FEEDBACK } from './feedback'
import { applyTheme, currentTheme, DEFAULT_THEME, type Theme } from './theme'
import { TownPalette } from './town-palette'
import { onPageScroll, pageScroller, pageScrollY } from './page-scroll'
import { useMyTown } from '../home/towns'

const DOCS = 'https://docs.fudoki.dev'
const MCP = `${DOCS}/mcp`
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'
/** 風土記の X アカウント。空にすると出さない */
const X = 'https://x.com/fudokijp'

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: '端末に合わせる', icon: <DesktopIcon /> },
  { value: 'light', label: 'ライト', icon: <SunIcon /> },
  { value: 'dark', label: 'ダーク', icon: <MoonIcon /> },
]

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

/** サーバーはテーマを知らない（HTML を誰にでも同じにする）。選択肢の印は hydrate の後に <head> の script が付けた印から読む */
function useTheme() {
  const [theme, setTheme] = React.useState<Theme>(DEFAULT_THEME)
  React.useEffect(() => setTheme(currentTheme()), [])
  const pick = (t: Theme) => {
    setTheme(t)
    applyTheme(t)
  }
  return [theme, pick] as const
}

/** 下へ読み進めている間は隠し、上へ戻したら出す。隠れている間は html に data-header-hidden を付け、頁の中で上に貼り付く帯が --site-header で上へ詰める。
 * 会話を横に開いて本文が自分でスクロールしている間（data-side-panel）は、ヘッダーは本文の外にあるので隠さない */
function useHideOnScroll() {
  const [hidden, setHidden] = React.useState(false)
  const { path } = useRouter()
  React.useEffect(() => setHidden(false), [path])
  React.useEffect(() => {
    let last = pageScrollY()
    const onScroll = () => {
      const y = pageScrollY()
      const d = y - last
      if (Math.abs(d) < 6) return
      setHidden(!pageScroller() && d > 0 && y > 56)
      last = y
    }
    return onPageScroll(onScroll)
  }, [])
  React.useEffect(() => {
    document.documentElement.toggleAttribute('data-header-hidden', hidden)
  }, [hidden])
  return [hidden, setHidden] as const
}

/** まちを探す欄。押すか ⌘K で、画面の中央に候補のパレット（TownPalette）を開く */
function TownSearch() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-full bg-muted px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]"
      >
        <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">まちを探す</span>
        <kbd className="ms-auto hidden font-sans text-xs md:inline">⌘K</kbd>
      </button>
      <TownPalette open={open} onOpenChange={setOpen} />
    </>
  )
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

/** 広い画面の右側。MCP とフィードバックは文字で、X・GitHub・テーマは icon で並べる */
function WideActions({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) {
  return (
    <div className="hidden items-center gap-1 md:flex">
      <Button variant="ghost" size="lg" nativeButton={false} render={<a href={MCP} {...EXTERNAL} />} className="text-muted-foreground">
        <PlugIcon aria-hidden="true" />
        MCP
      </Button>
      <Button variant="ghost" size="lg" nativeButton={false} render={<a href={FEEDBACK} {...EXTERNAL} />} className="text-muted-foreground">
        <ChatIcon aria-hidden="true" />
        フィードバック
      </Button>
      {X ? (
        <Button variant="ghost" size="icon-lg" nativeButton={false} render={<a href={X} aria-label="X" {...EXTERNAL} />} className="text-muted-foreground">
          <XLogoIcon className="size-5" aria-hidden="true" />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-lg" nativeButton={false} render={<a href={GITHUB} aria-label="GitHub" {...EXTERNAL} />} className="text-muted-foreground">
        <GithubLogoIcon className="size-5" aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="テーマ" className="text-muted-foreground" />}>
          <CircleHalfIcon className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>テーマ</DropdownMenuLabel>
          </DropdownMenuGroup>
          <ThemeChoices theme={theme} onPick={onPick} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** 狭い画面は、検索欄の幅を残すため、テーマ・MCP・フィードバック・X・GitHub を1つのメニューにまとめる */
function NarrowMenu({ theme, onPick }: { theme: Theme; onPick: (t: Theme) => void }) {
  const links = [
    { href: MCP, label: 'MCP', icon: <PlugIcon /> },
    { href: FEEDBACK, label: 'フィードバック', icon: <ChatIcon /> },
    ...(X ? [{ href: X, label: 'X', icon: <XLogoIcon /> }] : []),
    { href: GITHUB, label: 'GitHub', icon: <GithubLogoIcon /> },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="メニュー" className="shrink-0 text-muted-foreground md:hidden" />}>
        <DotsThreeIcon className="size-6" weight="bold" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>テーマ</DropdownMenuLabel>
        </DropdownMenuGroup>
        <ThemeChoices theme={theme} onPick={onPick} />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {links.map((l) => (
            <DropdownMenuItem key={l.label} render={<a href={l.href} {...EXTERNAL} />} className="gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
              {l.icon}
              {l.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SiteHeader() {
  const [hidden, setHidden] = useHideOnScroll()
  const [theme, pickTheme] = useTheme()
  // 初めの描画はサーバーもブラウザも town=null なので、hydrate はずれない
  const { town } = useMyTown()
  return (
    <header
      data-hidden={hidden || undefined}
      // 隠れている間も link は tab 順に残るので、focus が入ったら出す
      onFocus={() => setHidden(false)}
      className="glass sticky top-0 z-30 pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none data-hidden:-translate-y-full"
    >
      <div className="flex h-14 items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href={town ? town.path : '/'} aria-label="風土記 ホーム" className="flex shrink-0 items-center">
          {/* 色は svg に付ける（a { color: inherit } に負けて黒くならないように）。狭い画面はマークだけにして検索欄の幅を残す */}
          <Mark className="block size-8 text-primary md:hidden" />
          <Logo className="hidden h-7 w-auto text-primary md:block" />
        </Link>
        <div className="min-w-0 flex-1 md:max-w-sm">
          <TownSearch />
        </div>
        <div className="ms-auto flex items-center">
          <WideActions theme={theme} onPick={pickTheme} />
          <NarrowMenu theme={theme} onPick={pickTheme} />
        </div>
      </div>
      <Separator />
    </header>
  )
}
