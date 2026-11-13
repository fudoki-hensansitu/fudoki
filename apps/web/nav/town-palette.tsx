// まちを探すパレット（shadcn の Command）。サイドバーの「まちを探す」とホームの「他のまちを見る」が同じものを開く。選んだまちの頁へ移り、住んでいるまちは変えない。
// 当てるのはサーバー（/api/jurisdictions?q=）で、打った語ごとに上位の数件だけを読む
import * as React from 'react'
import { useRouter } from '@void/react'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { MapEntry } from '../jurisdiction/index-table'
import { searchTowns } from '../home/towns'

/** 打ち終えるのを待つ間 */
const TYPING_MS = 150

export function TownPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { visit } = useRouter()
  const [q, setQ] = React.useState('')
  // null は読めなかった。undefined は読んでいる
  const [entries, setEntries] = React.useState<MapEntry[] | null | undefined>(undefined)
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(() => void searchTowns(q, controller.signal).then((e) => !controller.signal.aborted && setEntries(e)), q ? TYPING_MS : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, q, attempt])
  const pick = (e: MapEntry) => {
    onOpenChange(false)
    visit(e.path)
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="まちを探す" description="自治体名で探して、そのまちの頁を開きます">
      <Command shouldFilter={false}>
        <CommandInput placeholder="自治体名で探す（例：品川）" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>
            {entries === null ? (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline underline-offset-4">
                読み込めませんでした。もう一度読む
              </button>
            ) : entries ? (
              '当たるまちは、まだ収録していません'
            ) : (
              '読み込んでいます…'
            )}
          </CommandEmpty>
          {(entries ?? []).map((e) => (
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
