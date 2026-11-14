// 自治体を名前で選ぶ検索欄と、自治体の紋章。ホーム・サイドバー・比べる頁で使う
import * as React from 'react'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { RequestTown } from '../nav/request-town'
import { townMatches, type MapEntry } from '../jurisdiction/index-table'

const emblem = (code: string) => `/jurisdictions/${code}/emblem.svg`
const matches = townMatches

/** 何か入力していて、当たる自治体が1つも無い */
const noMatch = (entries: MapEntry[], q: string) => q.trim() !== '' && !entries.some((e) => matches(e, q))

export function Emblem({ code, name, className = 'size-10' }: { code: string; name: string; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl border bg-emblem p-1.5', className)}>
      {failed ? <span className="text-sm text-foreground">{name[0]}</span> : <img src={emblem(code)} alt="" loading="lazy" className="size-full min-h-0 min-w-0 object-contain" onError={() => setFailed(true)} />}
    </span>
  )
}

/** plain: 白い地に置くとき。地と同じ白に溶けないよう枠を付ける */
export function Picker({ entries, onPick, placeholder, plain }: { entries: MapEntry[]; onPick: (e: MapEntry) => void; placeholder: string; plain?: boolean }) {
  const [query, setQuery] = React.useState('')
  return (
    <>
    <Combobox autoHighlight items={entries} onInputValueChange={(v, d) => d.reason === 'input-change' && setQuery(v)} filter={(e: MapEntry, q: string) => matches(e, q)} itemToStringLabel={(e: MapEntry) => e.name} value={null} onValueChange={(e) => e && onPick(e as MapEntry)}>
      {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
      <ComboboxInput showTrigger={false} aria-label="自治体名で探す" placeholder={placeholder} className={cn('h-12 rounded-full px-2 text-[15px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15', plain ? 'border-border bg-background [&_input]:placeholder:text-muted-foreground [&_svg]:text-muted-foreground' : 'border-0 bg-brand-fill text-brand-fill-foreground shadow-[var(--shadow-pill)] dark:bg-brand-fill dark:shadow-none [&_input]:placeholder:text-brand-fill-muted [&_svg]:text-brand-fill-muted')}>
        <InputGroupAddon>
          <MagnifyingGlassIcon className="size-5" />
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>当たる自治体は、まだ収録していません</ComboboxEmpty>
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
    {/* 候補の窓の中のリンクはキーボードで辿れないので、要望フォームへの入口は検索欄の下に出す。
        窓が閉じるときに入力欄が空に戻されても Tab でリンクへ進めるよう、手で打った語だけを覚える */}
    {noMatch(entries, query) ? <RequestTown className="mt-2 text-[13px]" /> : null}
    </>
  )
}
