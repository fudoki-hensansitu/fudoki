// 分野の icon と自治体の紋章。分野の icon は fudoki の自治体の頁と同じ
import * as React from 'react'
import { BankIcon, BasketballIcon, DotsThreeCircleIcon, FirstAidKitIcon, HandHeartIcon, HouseLineIcon, LeafIcon, ShieldCheckIcon, StorefrontIcon, StudentIcon, type Icon } from '@phosphor-icons/react'
import { cn } from '../lib/cn'

const FIELD_ICON: Record<string, Icon> = {
  bosai: ShieldCheckIcon, fukushi: HandHeartIcon, kyoiku: StudentIcon, iryo: FirstAidKitIcon, kurashi: HouseLineIcon,
  sangyo: StorefrontIcon, kankyo: LeafIcon, bunka: BasketballIcon, gyosei: BankIcon, other: DotsThreeCircleIcon,
}

export function FieldIcon({ id, className }: { id: string; className?: string }) {
  const I = FIELD_ICON[id] ?? DotsThreeCircleIcon
  return <I className={className} aria-hidden="true" />
}

/** 自治体の紋章。fudoki.dev の静的ファイルを同じ path で中継する（middleware/01.fudoki.ts）。読めなければ頭文字 */
export function Emblem({ code, name, className = 'size-10' }: { code: string; name: string; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl border bg-emblem p-2', className)}>
      {failed ? <span className="text-sm text-foreground">{name[0]}</span> : <img src={`/jurisdictions/${code}/emblem.svg`} alt="" loading="lazy" className="size-full min-h-0 min-w-0 object-contain" onError={() => setFailed(true)} />}
    </span>
  )
}
