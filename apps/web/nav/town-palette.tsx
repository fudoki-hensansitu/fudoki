// まちを探すパレット（shadcn の Command）。サイドバーの「まちを探す」とホームの「他のまちを見る」が同じものを開く。選んだまちの頁へ移り、住んでいるまちは変えない。
// 当てるのはサーバー（/api/jurisdictions?name=）で、打った語ごとに1頁ずつ読み、下まで scroll したら続きを足す（home/towns.ts の useTownSearch）
import * as React from 'react'
import { useRouter } from '@void/react'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { MoreDots } from '@/components/more-dots'
import type { MapEntry } from '../jurisdiction/index-table'
import { useTownSearch } from '../home/towns'
import { Emblem } from '../home/town-picker'

export function TownPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { visit } = useRouter()
  const [q, setQ] = React.useState('')
  const { entries, hasMore, more, moreKey, retry } = useTownSearch(open, q)
  const pick = (e: MapEntry) => {
    onOpenChange(false)
    visit(e.path)
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="まちを探す" description="自治体名で探して開きます">
      <Command shouldFilter={false}>
        <CommandInput placeholder="自治体名で探す（例：品川）" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>
            {entries === null ? (
              <button type="button" onClick={retry} className="underline underline-offset-4">
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
              {/* 名前だけでなく紋章でも見分けられるようにする（2026-11-18 yuito） */}
              <Emblem code={e.code} name={e.name} className="size-8 rounded-lg p-1" />
              {e.name}
              <span className="text-xs text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</span>
            </CommandItem>
          ))}
          {hasMore ? <MoreDots key={moreKey} onVisible={more} /> : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
