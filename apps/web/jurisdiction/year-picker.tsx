// 年度の切り替え。直近の年度はボタン、それより前はメニュー。自治体の頁と試作の頁で使う
// hrefOf を渡すと直近の年度をリンクにする（検索エンジンが年度の頁を辿れるように）。押したときは頁を読み直さず onChange で切り替える
import { CaretDownIcon } from '@phosphor-icons/react'
import { Hint } from '@/components/hint'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type * as React from 'react'
import { reiwa, yearName } from './types'

const RECENT_YEARS = 3

/** 新しいタブで開く操作（修飾キー・中ボタン）はリンクのまま通し、ふつうのクリックだけ頁の中で切り替える */
const inPageClick = (e: React.MouseEvent, run: () => void) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  run()
}

export function YearPicker({ years, current, onChange, hrefOf }: { years: number[]; current: number; onChange: (y: number) => void; hrefOf?: (y: number) => string }) {
  const recent = years.slice(0, RECENT_YEARS)
  const older = years.slice(RECENT_YEARS)
  const olderPicked = older.includes(current)
  const pill = (on: boolean) => `inline-flex h-8 items-center rounded-full px-2.5 text-[13px] ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`
  const label = (y: number) => (
    <>
      {yearName(y)}
      {yearName(y) !== reiwa(y) ? <span className={`hidden lg:inline ${y === current ? 'opacity-80' : 'text-muted-foreground'}`}>（{reiwa(y).replace(/年度$/, '')}）</span> : null}
    </>
  )
  return (
    <div role="group" aria-label="年度" className="flex gap-1">
      {recent.map((y) => (
        <Hint key={y} label={reiwa(y)}>
          {hrefOf ? (
            <a href={hrefOf(y)} aria-current={y === current ? 'page' : undefined} onClick={(e) => inPageClick(e, () => onChange(y))} className={`no-underline ${pill(y === current)}`}>
              {label(y)}
            </a>
          ) : (
            <button type="button" aria-pressed={y === current} onClick={() => onChange(y)} className={pill(y === current)}>
              {label(y)}
            </button>
          )}
        </Hint>
      ))}
      {older.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger className={`inline-flex items-center gap-0.5 ${pill(olderPicked)}`}>
            {olderPicked ? reiwa(current) : 'それより前'}
            <CaretDownIcon className="size-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuRadioGroup value={olderPicked ? String(current) : ''} onValueChange={(v) => onChange(Number(v))}>
              {older.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)}>{reiwa(y)}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
