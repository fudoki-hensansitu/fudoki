// サンキー図の金額のツールチップ。ラベルは割合（%）だけにして、金額は hover・focus で見せる
import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatYen } from './types'

/** ツールチップの中身。名前と金額（丸めた額と円単位の額） */
export function TipCard({ name, yen, missing }: { name: string; yen: number; missing?: boolean }) {
  return (
    <span className="grid gap-0.5 text-left">
      <span className="text-[12px] text-muted-foreground">{name}</span>
      {missing ? (
        <b className="text-[15px] font-semibold">金額未記載</b>
      ) : (
        <>
          <b className="text-[15px] font-semibold tabular-nums">{formatYen(yen)}</b>
          <span className="text-[11px] tabular-nums text-muted-foreground">{yen.toLocaleString('ja-JP')}円</span>
        </>
      )}
    </span>
  )
}

export const TIP_CARD = 'rounded-xl border bg-background px-3 py-2 text-foreground shadow-lg'

/** HTML の行に付けるツールチップ。children が割合のラベル */
export function AmountTip({ name, yen, missing, className, children, side = 'top' }: {
  name: string
  yen: number
  missing?: boolean
  className?: string
  children: React.ReactNode
  side?: 'top' | 'right' | 'left' | 'bottom'
}) {
  return (
    <Tooltip>
      <TooltipTrigger delay={100} render={<span tabIndex={0} className={className} />}>{children}</TooltipTrigger>
      <TooltipContent side={side} className={`block ${TIP_CARD} [&>:last-child]:hidden`}>
        <TipCard name={name} yen={yen} missing={missing} />
      </TooltipContent>
    </Tooltip>
  )
}
