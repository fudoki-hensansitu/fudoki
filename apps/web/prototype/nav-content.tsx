// 試作: サイドバーの中身。項目は まちを探す・アシスタント・事業を探す の3つだけ（うちのまちはホームなので置かない。ホームへはロゴから）。並べ方を3案で見比べる（ホームと同じピッカーで切り替え）。
// 1 うちのまち中心: 頭にまちの検索欄 / 2 さがす中心: まちの検索欄はホームに置き、項目だけ並べる / 3 まちの中で使う: うちのまちを見出しに置き、事業を探すはうちのまちに絞る
import * as React from 'react'
import { HouseIcon, ListMagnifyingGlassIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, useSidebar } from '@/components/ui/sidebar'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import type { MapEntry } from '../jurisdiction/index-table'
import { Item } from '../nav/site-nav'
import { searchHref } from './search'
import { emblemSrc, loadTowns, useMyTown, type Town } from './towns'
import { useVariant } from './variant'

/** スマホの下の帯の「まちを探す」が投げる（nav/site-nav.tsx） */
const FIND = 'fudoki:find-town'

/** まちを探す欄。⌘K と下の帯の「まちを探す」で入る。選んだまちの頁へ移る */
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
    window.addEventListener(FIND, focus)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(FIND, focus)
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

const TownIcon = ({ town }: { town: Town | null }) =>
  town ? (
    <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-emblem p-[2px] ring-1 ring-sidebar-border">
      <img src={emblemSrc(town.code)} alt="" className="size-full object-contain" />
    </span>
  ) : (
    <HouseIcon />
  )

const isAssistant = (path: string) => path === '/assistant' || path.startsWith('/s/')

/** 1 うちのまち中心 */
function Mine({ path, town }: { path: string; town: Town | null }) {
  return (
    <>
      <SidebarGroup className="pt-0">
        <TownSearch />
      </SidebarGroup>
      <SidebarGroup>
        <SidebarMenu>
          <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
          <Item href="/prototype/search" label="事業を探す" icon={<ListMagnifyingGlassIcon />} active={path.startsWith('/prototype/search')} />
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}

/** 2 さがす中心。まちの検索欄はホームに置き、ここからはホームのまちの欄へ入る */
function Seek({ path }: { path: string; town: Town | null }) {
  const { visit } = useRouter()
  const { setOpenMobile } = useSidebar()
  const seekTown = () => {
    setOpenMobile(false)
    if (path === '/prototype') window.dispatchEvent(new Event('fudoki:seek-town'))
    else visit('/prototype?seek=town')
  }
  return (
    <>
      <SidebarGroup className="pt-0">
        <SidebarMenu>
          <Item
            href="/prototype?seek=town"
            label="まちを探す"
            icon={<MagnifyingGlassIcon />}
            onClick={(e) => {
              e.preventDefault()
              seekTown()
            }}
          />
          <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
          <Item href="/prototype/search" label="事業を探す" icon={<ListMagnifyingGlassIcon />} active={path.startsWith('/prototype/search')} />
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}

/** 3 まちの中で使う。頭にうちのまち、その下の項目はうちのまちに絞る。ほかのまちは検索欄から */
function Inside({ path, town }: { path: string; town: Town | null }) {
  return (
    <>
      <SidebarGroup className="pt-0">
        <TownSearch />
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel className="h-auto gap-2 py-1.5 text-[13px] text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          <TownIcon town={town} />
          <span className="truncate font-bold">{town ? town.name : 'うちのまち'}</span>
        </SidebarGroupLabel>
        <SidebarMenu>
          <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
          <Item href={town ? searchHref('', town.code) : '/prototype/search'} label="事業を探す" icon={<ListMagnifyingGlassIcon />} active={path.startsWith('/prototype/search')} />
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}

export function ProtoNavContent() {
  const { path } = useRouter()
  const { town } = useMyTown()
  const { current } = useVariant()
  const Body = current === 1 ? Seek : current === 2 ? Inside : Mine
  return (
<Body path={path} town={town} />
  )
}
