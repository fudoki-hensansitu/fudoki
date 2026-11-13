// サイドバーの中身。項目は まちを探す（頭の検索欄）・アシスタント・比べる の3つだけ。住んでいるまちはホームなので置かない（ホームへはロゴから）
import * as React from 'react'
import { ArrowsLeftRightIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Item } from './site-nav'
import { TownPalette } from './town-palette'

/** まちを探す。欄を押すか ⌘K で、画面の中央に候補のパレット（TownPalette）を開く。選んだまちの頁へ移る */
function TownSearch() {
  const { state, isMobile } = useSidebar()
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
  const show = () => setOpen(true)
  const palette = <TownPalette open={open} onOpenChange={setOpen} />
  // サイドバーの項目と同じ SidebarMenuButton・同じ形（角丸・高さ・icon と文字の位置）で描き、枠を付けずに薄い地だけで欄とわかるようにする。閉じているときは他の項目と同じ icon だけにする
  return (
    <SidebarMenuItem className="mb-2 group-data-[collapsible=icon]:mb-0">
      <SidebarMenuButton
        onClick={show}
        aria-keyshortcuts="Meta+K Control+K"
        tooltip={state === 'collapsed' && !isMobile ? 'まちを探す' : undefined}
        // oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで
        className="h-10 gap-3 bg-sidebar-foreground/5 px-3 text-sm text-muted-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-2.5! group-data-[collapsible=icon]:text-sidebar-foreground [&_svg]:size-5"
      >
        <MagnifyingGlassIcon />
        <span>まちを探す</span>
      </SidebarMenuButton>
      {palette}
    </SidebarMenuItem>
  )
}

const isAssistant = (path: string) => path === '/assistant' || path.startsWith('/s/')

export function NavContent() {
  const { path } = useRouter()
  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        <TownSearch />
        <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
        <Item href="/compare" label="比べる" icon={<ArrowsLeftRightIcon />} active={path === '/compare'} />
      </SidebarMenu>
    </SidebarGroup>
  )
}
