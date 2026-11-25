// まちを探すパレット（shadcn の Command）。広い画面は中央の dialog、狭い画面は下から出る sheet に入れる（2026-11-25 yuito「command はモバイルでは使いづらい」）。ヘッダーの「まちを探す」とホームの「他のまちを見る」が同じものを開く。選んだまちの頁へ移り、住んでいるまちは変えない。
// 当てるのはサーバー（/api/jurisdictions?name=）で、打った語ごとに1頁ずつ読み、下まで scroll したら続きを足す（home/towns.ts の useTownSearch）
import * as React from 'react'
import { useRouter } from '@void/react'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { MoreDots } from '@/components/more-dots'
import type { MapEntry } from '../jurisdiction/index-table'
import { useTownSearch } from '../home/towns'
import { Emblem } from '../home/town-picker'

const NARROW = '(max-width: 767px)'

/** 狭い画面か。サーバーと hydrate の初めは広い画面として描く（パレットは閉じて始まるので見た目は変わらない） */
function useNarrow() {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const m = window.matchMedia(NARROW)
    const sync = () => setNarrow(m.matches)
    sync()
    m.addEventListener('change', sync)
    return () => m.removeEventListener('change', sync)
  }, [])
  return narrow
}

export function TownPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const narrow = useNarrow()
  const body = <TownSearchBody open={open} onOpenChange={onOpenChange} sheet={narrow} />
  if (narrow) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* 下から出る iOS のシート。入力欄を上に置き、キーボードが下を覆っても候補を上から読める */}
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl data-[side=bottom]:h-[92dvh] pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="pb-2">
            <SheetTitle>まちを探す</SheetTitle>
            <SheetDescription className="sr-only">自治体名で探して開きます</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="まちを探す" description="自治体名で探して開きます">
      {body}
    </CommandDialog>
  )
}

function TownSearchBody({ open, onOpenChange, sheet }: { open: boolean; onOpenChange: (open: boolean) => void; sheet: boolean }) {
  const { visit } = useRouter()
  const [q, setQ] = React.useState('')
  const { entries, hasMore, more, moreKey, retry } = useTownSearch(open, q)
  const pick = (e: MapEntry) => {
    onOpenChange(false)
    visit(e.path)
  }
  return (
      <Command shouldFilter={false} className={sheet ? 'min-h-0 flex-1 rounded-none! px-3' : undefined}>
        {/* シートでは開いたらすぐ打てるよう入力欄に focus し、iOS が拡大しないよう 16px にする */}
        <CommandInput placeholder="自治体名で探す（例：品川）" value={q} onValueChange={setQ} autoFocus={sheet} className={sheet ? 'text-base' : undefined} />
        <CommandList className={sheet ? 'max-h-none flex-1' : undefined}>
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
  )
}
