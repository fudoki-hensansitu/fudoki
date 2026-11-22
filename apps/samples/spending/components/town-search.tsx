// まちを名前で探す欄。打った語で風土記の自治体の検索（/api/jurisdictions?name=、中継）に1頁ずつ聞き、候補を下に並べる。選んだらそのまちのレシートの頁へ移る。
// brand: 緑の札の中に置く（白い欄）。そうでなければ地のままの欄
import * as React from 'react'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { useRouter } from '@void/react'
import { cn } from '../lib/cn'
import type { TownEntry } from '../lib/fudoki'
import { Emblem } from './parts'

type Page = { entries: TownEntry[]; next: string | null }

/** 打ち終えるのを待つ間 */
const TYPING_MS = 150

const search = (q: string, cursor: string | null, signal?: AbortSignal): Promise<Page | null> =>
  fetch(`/api/jurisdictions?${new URLSearchParams({ name: q, ...(cursor ? { cursor } : {}) })}`, { signal })
    .then((r) => (r.ok ? (r.json() as Promise<Page>) : null))
    .then((p) => (p && Array.isArray(p.entries) ? p : null))
    .catch(() => null)

export function TownSearch({ placeholder, brand = false, className }: { placeholder: string; brand?: boolean; className?: string }) {
  const { visit } = useRouter()
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  /** undefined は読んでいる、null は読めなかった */
  const [page, setPage] = React.useState<Page | null | undefined>(undefined)
  const [active, setActive] = React.useState(0)
  const id = React.useId()
  React.useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    setPage(undefined)
    const t = setTimeout(() => void search(q.trim(), null, ac.signal).then((p) => !ac.signal.aborted && (setPage(p), setActive(0))), TYPING_MS)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [q, open])
  /** 今の語（続きが届いたときに語が変わっていたら捨てる） */
  const latest = React.useRef(q)
  latest.current = q
  const more = () => {
    const asked = q
    if (page?.next) void search(asked.trim(), page.next).then((p) => p && latest.current === asked && setPage((x) => (x ? { entries: [...x.entries, ...p.entries], next: p.next } : p)))
  }
  const entries = page?.entries ?? []
  const pick = (e: TownEntry) => {
    setOpen(false)
    visit(`/${e.code}`)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setActive((i) => Math.min(i + 1, entries.length - 1)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(i - 1, 0)))
    else if (e.key === 'Enter' && entries[active]) (e.preventDefault(), pick(entries[active]))
    else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div className={cn('relative', className)}>
      <label className={cn('flex h-12 items-center gap-2 rounded-full px-4 text-sm', brand ? 'bg-brand-fill text-brand-fill-foreground shadow-[var(--shadow-pill)] dark:shadow-none' : 'border border-border bg-background')}>
        <MagnifyingGlassIcon className={cn('size-5 shrink-0', brand ? 'text-brand-fill-muted' : 'text-muted-foreground')} aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-label="自治体名で探す"
          aria-activedescendant={open && entries[active] ? `${id}-${active}` : undefined}
          value={q}
          placeholder={placeholder}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          className={cn('min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm', brand ? 'placeholder:text-brand-fill-muted' : 'placeholder:text-muted-foreground')}
        />
      </label>
      {open ? (
        <ul id={id} role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-sheet)]">
          {page === undefined ? <li className="px-3 py-3 text-sm text-muted-foreground">読み込んでいます…</li> : null}
          {page === null ? <li className="px-3 py-3 text-sm text-muted-foreground">読み込めませんでした</li> : null}
          {page && entries.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">当たる自治体は、まだ収録していません</li> : null}
          {entries.map((e, i) => (
            <li
              key={e.code}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => pick(e)}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm', i === active && 'bg-card')}
            >
              <Emblem code={e.code} name={e.name} className="size-8 rounded-lg p-1" />
              {e.name}
              <small className="text-xs text-muted-foreground">{e.kind === '都道府県' ? '都道府県' : e.prefecture}</small>
            </li>
          ))}
          {page?.next ? (
            <li>
              <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={more} className="w-full rounded-xl px-3 py-2 text-left text-sm text-muted-foreground hover:bg-card">
                もっと見る
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
