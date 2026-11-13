// まちを探すパレット（shadcn の Command）。サイドバーの「まちを探す」とホームの「他のまちを見る」が同じものを開く。選んだまちの頁へ移り、住んでいるまちは変えない
import * as React from 'react'
import { useRouter } from '@void/react'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { MapEntry } from '../jurisdiction/index-table'
import { loadTowns, townMatches } from '../home/towns'

/** 一覧を先に読み始める（欄に触れたときなど）。読み終えたものは loadTowns が覚える */
export const warmTowns = () => void loadTowns()

export function TownPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { visit } = useRouter()
  const [entries, setEntries] = React.useState<MapEntry[]>([])
  // cmdk の filter は value（コード）しか渡さないので、コードから自治体を引く
  const byKey = React.useMemo(() => new Map(entries.map((e) => [e.code, e])), [entries])
  // 一覧は空では返らないので、読み終えて空なら取得に失敗している
  const [loaded, setLoaded] = React.useState(false)
  const load = () => void loadTowns().then((e) => (setEntries(e), setLoaded(true)))
  React.useEffect(() => {
    if (open) load()
  }, [open])
  const pick = (e: MapEntry) => {
    onOpenChange(false)
    visit(e.path)
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="まちを探す" description="自治体名で探して、そのまちの頁を開きます">
      <Command filter={(value, q) => (townMatches(byKey.get(value) ?? { name: value, prefecture: '', path: '' }, q) ? 1 : 0)}>
        <CommandInput placeholder="自治体名で探す（例：品川）" />
        <CommandList>
          <CommandEmpty>
            {entries.length ? (
              '当たるまちは、まだ収録していません'
            ) : loaded ? (
              <button type="button" onClick={load} className="underline underline-offset-4">
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
}
