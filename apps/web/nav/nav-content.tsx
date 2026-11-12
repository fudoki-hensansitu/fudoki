// サイドバーの中身。項目は まちを探す（頭の検索欄）・アシスタント・事業を検索 の3つだけ。住んでいるまちはホームなので置かない（ホームへはロゴから）
import * as React from 'react'
import { ListMagnifyingGlassIcon, MagnifyingGlassIcon, RobotIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { MapEntry } from '../jurisdiction/index-table'
import { Item } from './site-nav'
import { loadTowns, townMatches } from '../home/towns'

/** まちを探す。欄を押すか ⌘K で、画面の中央に候補のパレット（shadcn の Command）を開く。選んだまちの頁へ移る */
function TownSearch() {
  const { state, isMobile } = useSidebar()
  const { visit } = useRouter()
  const [entries, setEntries] = React.useState<MapEntry[]>([])
  // cmdk の filter は value（コード）しか渡さないので、コードから自治体を引く
  const byKey = React.useMemo(() => new Map(entries.map((e) => [e.code, e])), [entries])
  // 一覧は空では返らないので、読み終えて空なら取得に失敗している
  const [loaded, setLoaded] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const warm = () => void loadTowns().then((e) => (setEntries(e), setLoaded(true)))
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
      <Command filter={(value, q) => (townMatches(byKey.get(value) ?? { name: value, prefecture: '', path: '' }, q) ? 1 : 0)}>
        <CommandInput placeholder="自治体名で探す（例：品川）" />
        <CommandList>
          <CommandEmpty>
            {entries.length ? (
              '当たるまちは、まだ収録していません'
            ) : loaded ? (
              <button type="button" onClick={warm} className="underline underline-offset-4">
                一覧を読み込めませんでした。もう一度読む
              </button>
            ) : (
              '読み込んでいます…'
            )}
          </CommandEmpty>
          {entries.map((e) => (
            <CommandItem key={e.code} value={e.code} onSelect={() => pick(e)}>
              {e.name}
              <span className="text-[11px] text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
  // サイドバーの項目と同じ SidebarMenuButton・同じ形（角丸・高さ・icon と文字の位置）で描き、枠を付けずに薄い地だけで欄とわかるようにする。閉じているときは他の項目と同じ icon だけにする
  return (
    <SidebarMenuItem className="mb-2 group-data-[collapsible=icon]:mb-0">
      <SidebarMenuButton
        onClick={show}
        onPointerEnter={warm}
        aria-keyshortcuts="Meta+K Control+K"
        tooltip={state === 'collapsed' && !isMobile ? 'まちを探す' : undefined}
        // biome-ignore lint/plugin/color-opacity: 既存のずれ。直すか例外にするか決めるまで
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
      <SidebarMenu data-tour="nav">
        <TownSearch />
        <Item href="/assistant" label="アシスタント" icon={<RobotIcon />} active={isAssistant(path)} />
        <Item href="/search" label="事業を検索" icon={<ListMagnifyingGlassIcon />} active={path.startsWith('/search')} />
      </SidebarMenu>
    </SidebarGroup>
  )
}
