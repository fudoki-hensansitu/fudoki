// 試作の小さな部品。自治体の頁（jurisdiction/app/app-page.tsx）と同じ分野の icon と金額の書き方
import { BankIcon, BasketballIcon, DotsThreeCircleIcon, FirstAidKitIcon, HandHeartIcon, HouseLineIcon, LeafIcon, ShieldCheckIcon, StorefrontIcon, StudentIcon, type Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const FIELD_ICON: Record<string, Icon> = {
  bosai: ShieldCheckIcon, fukushi: HandHeartIcon, kyoiku: StudentIcon, iryo: FirstAidKitIcon, kurashi: HouseLineIcon,
  sangyo: StorefrontIcon, kankyo: LeafIcon, bunka: BasketballIcon, gyosei: BankIcon, other: DotsThreeCircleIcon,
}

export function FieldIcon({ id, className }: { id: string; className?: string }) {
  const I = FIELD_ICON[id] ?? DotsThreeCircleIcon
  return <I className={className} aria-hidden="true" />
}

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

export const perHeadText = (yen: number, people: number) => {
  const v = yen / people
  return v >= 1e4 ? `${(v / 1e4).toFixed(1)}万円` : `${Math.round(v).toLocaleString('ja-JP')}円`
}
