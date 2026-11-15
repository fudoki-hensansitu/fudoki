// 金額の表記。数字を強調し、単位は小さく
import { cn } from '@/lib/utils'

export function yenParts(y: number): [string, string] {
  if (Math.abs(y) >= 1e8) {
    const v = y / 1e8
    return [v >= 100 ? Math.round(v).toLocaleString('ja-JP') : v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }), '億円']
  }
  return [Math.round(y / 1e4).toLocaleString('ja-JP'), '万円']
}
/** 数字を強調し、単位は小さく */
export function Amt({ yen, className }: { yen: number | null | undefined; className?: string }) {
  if (yen == null) return <span className={cn('text-muted-foreground', className)}>—</span>
  const [n, u] = yenParts(yen)
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {n}
      <small className="ml-px text-[0.6em]">{u}</small>
    </span>
  )
}
