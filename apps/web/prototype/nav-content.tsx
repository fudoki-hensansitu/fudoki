// 試作: サイドバーの中身。頭に検索、真ん中に機能、その下に「うちのまち」（登録したまちと最近見たまち）。
// 全自治体の一覧は置かない。自治体は検索で探し、自分で選んだ・見たまちだけを並べる
import * as React from 'react'
import { ArrowsLeftRightIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, useSidebar } from '@/components/ui/sidebar'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import type { MapEntry } from '../jurisdiction/index-table'
import { Item } from '../nav/site-nav'
import { emblemSrc, useMyTown, type Town } from './towns'

/** 自治体の一覧は検索を開いたときに一度だけ読む */
let townsPromise: Promise<MapEntry[]> | null = null
const loadTowns = () =>
  (townsPromise ??= fetch('/api/prototype/towns')
    .then((r) => (r.ok ? (r.json() as Promise<MapEntry[]>) : Promise.reject(r)))
    .catch(() => {
      townsPromise = null
      return [] as MapEntry[]
    }))

function Search() {
  const { state, isMobile, setOpen } = useSidebar()
  const { visit } = useRouter()
  const [entries, setEntries] = React.useState<MapEntry[]>([])
  const input = React.useRef<HTMLInputElement>(null)
  const warm = () => void loadTowns().then(setEntries)
  // ⌘K / Ctrl+K で検索へ。閉じていたら開いてから入れる
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        warm()
        requestAnimationFrame(() => input.current?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenu>
        <Item
          href="#search"
          label="さがす"
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
      <ComboboxInput ref={input} showTrigger={false} aria-label="まちをさがす" placeholder="まちをさがす" onFocus={warm} className="h-9 rounded-md border-sidebar-border bg-background text-sm">
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

function TownItem({ town, active }: { town: Town; active: boolean }) {
  return (
    <Item
      href={town.path}
      label={town.name}
      active={active}
      icon={
        <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-emblem p-[2px] ring-1 ring-sidebar-border">
          <img src={emblemSrc(town.code)} alt="" className="size-full object-contain" />
        </span>
      }
    />
  )
}

export function ProtoNavContent() {
  const { path } = useRouter()
  const { town, recent } = useMyTown()
  const at = (t: Town) => path === t.path || path.startsWith(`${t.path}/`)
  return (
    <>
      <SidebarGroup className="pt-0">
        <Search />
      </SidebarGroup>
      <SidebarGroup>
        <SidebarMenu>
          <Item href="/prototype/compare" label="比べる" icon={<ArrowsLeftRightIcon />} active={path.startsWith('/prototype/compare')} />
          <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={path === '/assistant' || path.startsWith('/s/')} />
        </SidebarMenu>
      </SidebarGroup>
      {town ? (
        <SidebarGroup>
          <SidebarGroupLabel>うちのまち</SidebarGroupLabel>
          <SidebarMenu>
            <TownItem town={town} active={at(town)} />
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
      {recent.length ? (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>最近見たまち</SidebarGroupLabel>
          <SidebarMenu>
            {recent.slice(0, 3).map((t) => (
              <TownItem key={t.code} town={t} active={at(t)} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
    </>
  )
}

