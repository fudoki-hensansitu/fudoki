// まだ収録していない自治体に行き当たったとき（検索で当たらない・現在地の自治体が無い・頁はあるが決算が無い）の次の一手。感想・要望のフォームへ繋ぐ
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { FEEDBACK } from './feedback'

export function RequestTown({ className }: { className?: string }) {
  return (
    <a href={FEEDBACK} target="_blank" rel="noopener" className={cn('inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground', className)}>
      収録してほしい自治体を送る
      <ArrowSquareOutIcon aria-hidden="true" className="size-3.5" />
    </a>
  )
}
