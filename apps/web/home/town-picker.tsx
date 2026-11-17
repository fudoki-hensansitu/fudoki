// 自治体を名前で選ぶ検索欄と、自治体の紋章。ホーム・サイドバー・比べる頁で使う
import * as React from 'react'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { MoreDots } from '@/components/more-dots'
import { InputGroupAddon } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { RequestTown } from '../nav/request-town'
import type { MapEntry } from '../jurisdiction/index-table'
import { useTownSearch } from './towns'

const emblem = (code: string) => `/jurisdictions/${code}/emblem.svg`

export function Emblem({ code, name, className = 'size-10' }: { code: string; name: string; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl border bg-emblem p-2', className)}>
      {failed ? <span className="text-sm text-foreground">{name[0]}</span> : <img src={emblem(code)} alt="" loading="lazy" className="size-full min-h-0 min-w-0 object-contain" onError={() => setFailed(true)} />}
    </span>
  )
}

/** plain: 白い地に置くとき。地と同じ白に溶けないよう枠を付ける。
 * 候補は全部を手元に取らず、打った語でサーバー（/api/jurisdictions?name=）に1頁ずつ聞き、下まで scroll したら続きを足す */
export function Picker({ onPick, placeholder, plain }: { onPick: (e: MapEntry) => void; placeholder: string; plain?: boolean }) {
  const [open, setOpen] = React.useState(false)
  // 欄の今の語（候補を聞く）と、手で打った語（窓が閉じて欄が空に戻っても、要望フォームへの入口を残す）
  const [term, setTerm] = React.useState('')
  const [query, setQuery] = React.useState('')
  const { entries, word, hasMore, more, moreKey } = useTownSearch(open, term)
  // 手で打った語に当たる自治体が1つも無かった（窓が閉じて欄の語が変わっても覚えておく）
  const [missed, setMissed] = React.useState<string | null>(null)
  if (word === query && query.trim() !== '' && entries?.length === 0 && missed !== query) setMissed(query)
  const noMatch = query.trim() !== '' && missed === query
  return (
    <>
    <Combobox autoHighlight open={open} onOpenChange={setOpen} items={entries ?? []} filter={null} onInputValueChange={(v, d) => (setTerm(v), d.reason === 'input-change' && setQuery(v))} itemToStringLabel={(e: MapEntry) => e.name} value={null} onValueChange={(e) => e && onPick(e as MapEntry)}>
      {/* oxlint-disable-next-line design/color-opacity -- 既存のずれ。直すか例外にするか決めるまで */}
      <ComboboxInput showTrigger={false} aria-label="自治体名で探す" placeholder={placeholder} className={cn('h-12 rounded-full px-2 text-sm has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15', plain ? 'border-border bg-background [&_input]:placeholder:text-muted-foreground [&_svg]:text-muted-foreground' : 'border-0 bg-brand-fill text-brand-fill-foreground shadow-[var(--shadow-pill)] dark:bg-brand-fill dark:shadow-none [&_input]:placeholder:text-brand-fill-muted [&_svg]:text-brand-fill-muted')}>
        <InputGroupAddon>
          <MagnifyingGlassIcon className="size-5" />
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>{entries === null ? '読み込めませんでした' : entries ? '当たる自治体は、まだ収録していません' : '読み込んでいます…'}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(e: MapEntry) => (
              <ComboboxItem key={e.code} value={e}>
                {e.name}
                <small className="text-xs text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</small>
              </ComboboxItem>
            )}
          </ComboboxCollection>
          {hasMore ? <MoreDots key={moreKey} onVisible={more} /> : null}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    {/* 候補の窓の中のリンクはキーボードで辿れないので、要望フォームへの入口は検索欄の下に出す。
        窓が閉じるときに入力欄が空に戻されても Tab でリンクへ進めるよう、手で打った語だけを覚える */}
    {noMatch ? <RequestTown className="mt-2 text-sm" /> : null}
    </>
  )
}
