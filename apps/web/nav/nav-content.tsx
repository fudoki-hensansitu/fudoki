// サイドバーの中身。項目は まちを探す（頭の検索欄）・アシスタント・事業を検索 の3つだけ。住んでいるまちはホームなので置かない（ホームへはロゴから）
import * as React from 'react'
import { ListMagnifyingGlassIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarMenu, useSidebar } from '@/components/ui/sidebar'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
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
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenu>
        <Item
          href="#search"
          label="まちを探す"
          icon={<MagnifyingGlassIcon />}
          onClick={(e) => {
            e.preventDefault()
            show()
          }}
        />
        {palette}
      </SidebarMenu>
    )
  }
  return (
    <>
      {/* 下の項目（px-3・icon 20px・gap-3・高さ 40px）と icon の位置・大きさ・文字までの間を揃える。枠の 1px を引いて 11px */}
      <button
        type="button"
        onClick={show}
        onPointerEnter={warm}
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-10 w-full items-center gap-3 rounded-full border border-sidebar-border bg-background px-[11px] text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <MagnifyingGlassIcon className="size-5 shrink-0" />
        <span className="flex-1 text-left">まちを探す</span>
        <Kbd>⌘K</Kbd>
      </button>
      {palette}
    </>
  )
}

const isAssistant = (path: string) => path === '/assistant' || path.startsWith('/s/')

export function NavContent() {
  const { path } = useRouter()
  return (
    <>
      {/* 欄の focus の輪（3px）が、スクロールする枠の上端で切れないよう少し空ける */}
      <SidebarGroup className="pt-1">
        <TownSearch />
      </SidebarGroup>
      <SidebarGroup>
        <SidebarMenu data-tour="nav">
          <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
          <Item href="/search" label="事業を検索" icon={<ListMagnifyingGlassIcon />} active={path.startsWith('/search')} />
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}
