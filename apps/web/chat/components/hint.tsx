// 短い説明を出す Tooltip。title 属性はブラウザ標準の見た目になり、他の tooltip と揃わないので使わない
import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** children（要素1つ）に hover・focus で label を出す。children の props と handler はそのまま残る。popover（top layer）の中では container にその要素を渡す — body に出すと top layer の下に隠れる */
export function Hint({ label, side, container, children }: { label: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; container?: React.RefObject<HTMLElement | null>; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} container={container}>{label}</TooltipContent>
    </Tooltip>
  )
}
