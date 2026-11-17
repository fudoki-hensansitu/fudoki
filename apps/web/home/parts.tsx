// ホームと比べる頁の小さな部品。自治体の頁（jurisdiction/app/app-page.tsx）と同じ分野の icon と金額の書き方
import { BankIcon, BasketballIcon, DotsThreeCircleIcon, FirstAidKitIcon, HandHeartIcon, HouseLineIcon, LeafIcon, ShieldCheckIcon, StorefrontIcon, StudentIcon, type Icon } from '@phosphor-icons/react'

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

