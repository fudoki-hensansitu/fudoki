// 短い説明を出す Tooltip。title 属性はブラウザ標準の見た目になり、他の tooltip と揃わないので使わない
import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** children（要素1つ）に hover・focus で label を出す。children の props と handler はそのまま残る */
export function Hint({ label, side, children }: { label: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
