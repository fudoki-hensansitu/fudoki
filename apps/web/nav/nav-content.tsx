// サイドバーの中身。項目は まちを探す（頭の検索欄）・アシスタント・事業を検索 の3つだけ。住んでいるまちはホームなので置かない（ホームへはロゴから）
import * as React from 'react'
import { ListMagnifyingGlassIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarMenu, useSidebar } from '@/components/ui/sidebar'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import type { MapEntry } from '../jurisdiction/index-table'
import { Item } from './site-nav'
import { loadTowns } from '../home/towns'

/** まちを探す欄。⌘K で入る。選んだまちの頁へ移る */
function TownSearch() {
  const { state, isMobile, setOpen } = useSidebar()
  const { visit } = useRouter()
  const [entries, setEntries] = React.useState<MapEntry[]>([])
  const input = React.useRef<HTMLInputElement>(null)
  const warm = () => void loadTowns().then(setEntries)
  React.useEffect(() => {
    const focus = () => {
      setOpen(true)
      warm()
      requestAnimationFrame(() => input.current?.focus())
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [setOpen])
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenu>
        <Item
          href="#search"
          label="まちを探す"
          icon={<MagnifyingGlassIcon />}
          onClick={(e) => {
            e.preventDefault()
            setOpen(true)
            warm()
            setTimeout(() => input.current?.focus(), 220)
          }}
        />
      </SidebarMenu>
    )
  }
  return (
    <Combobox autoHighlight items={entries} filter={(e: MapEntry, q: string) => !q.trim() || e.name.includes(q.trim()) || e.path.includes(q.trim().toLowerCase())} itemToStringLabel={(e: MapEntry) => e.name} value={null} onValueChange={(e) => e && visit((e as MapEntry).path)}>
      <ComboboxInput ref={input} showTrigger={false} aria-label="まちを探す" placeholder="まちを探す" onFocus={warm} className="h-9 rounded-md border-sidebar-border bg-background text-sm">
        <InputGroupAddon>
          <MagnifyingGlassIcon className="size-4" />
        </InputGroupAddon>
        <kbd className="me-2 hidden rounded border px-1 text-[10px] text-muted-foreground lg:inline">⌘K</kbd>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>{entries.length ? '当たるまちは、まだ収録していません' : '読み込んでいます…'}</ComboboxEmpty>
        <ComboboxList>
          {(e: MapEntry) => (
            <ComboboxItem key={e.code} value={e}>
              {e.name}
              <small className="text-[11px] text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</small>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const isAssistant = (path: string) => path === '/assistant' || path.startsWith('/s/')

export function NavContent() {
  const { path } = useRouter()
  return (
    <>
      <SidebarGroup className="pt-0">
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
