// サイドバーの中身。項目は まちを探す（頭の検索欄）・アシスタント・事業を検索 の3つだけ。住んでいるまちはホームなので置かない（ホームへはロゴから）
import * as React from 'react'
import { ListMagnifyingGlassIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { MapEntry } from '../jurisdiction/index-table'
import { Item } from './site-nav'
import { loadTowns } from '../home/towns'

/** まちを探す。欄を押すか ⌘K で、画面の中央に候補のパレット（shadcn の Command）を開く。選んだまちの頁へ移る */
function TownSearch() {
  const { state, isMobile } = useSidebar()
  const { visit } = useRouter()
  const [entries, setEntries] = React.useState<MapEntry[]>([])
  const [open, setOpen] = React.useState(false)
  const warm = () => void loadTowns().then(setEntries)
  const show = () => {
    warm()
    setOpen(true)
  }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        warm()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const pick = (e: MapEntry) => {
    setOpen(false)
    visit(e.path)
  }
  const palette = (
    <CommandDialog open={open} onOpenChange={setOpen} title="まちを探す" description="自治体名で探して、そのまちの頁を開きます">
      <Command filter={(value, q) => (value.includes(q.trim().toLowerCase()) ? 1 : 0)}>
        <CommandInput placeholder="自治体名で探す（例：品川）" />
        <CommandList>
          <CommandEmpty>{entries.length ? '当たるまちは、まだ収録していません' : '読み込んでいます…'}</CommandEmpty>
          {entries.map((e) => (
            <CommandItem key={e.code} value={`${e.name} ${e.path}`} onSelect={() => pick(e)}>
              {e.name}
              <span className="text-[11px] text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
  // サイドバーの項目と同じ SidebarMenuButton で描き、icon・文字の位置と大きさを下の項目にそろえる。開いているときだけ枠を付けた欄に見せる
  return (
    <SidebarMenuItem className="mb-3 group-data-[collapsible=icon]:mb-0">
      <SidebarMenuButton
        variant="outline"
        onClick={show}
        onPointerEnter={warm}
        aria-keyshortcuts="Meta+K Control+K"
        tooltip={state === 'collapsed' && !isMobile ? 'まちを探す' : undefined}
        className="h-10 gap-3 rounded-full px-3 text-sm text-muted-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-2.5! group-data-[collapsible=icon]:text-sidebar-foreground group-data-[collapsible=icon]:shadow-none [&_svg]:size-5"
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
      <SidebarMenu data-tour="nav">
        <TownSearch />
        <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
        <Item href="/search" label="事業を検索" icon={<ListMagnifyingGlassIcon />} active={path.startsWith('/search')} />
      </SidebarMenu>
    </SidebarGroup>
  )
}
