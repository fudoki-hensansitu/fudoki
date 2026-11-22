// 見出しと、見出しの大きさで見せる金額。大きさは段だけにする（fudoki の DESIGN.md の Typography と同じ4段）
import type * as React from 'react'
import { cn } from '../lib/cn'

const SIZE = {
  h1: 'text-[28px] leading-[1.35] tracking-[0.02em] sm:text-[32px]',
  h2: 'text-2xl leading-snug',
  h3: 'text-xl leading-snug',
  headline: 'text-base',
} as const
const TAG = { h1: 'h1', h2: 'h2', h3: 'h3', headline: 'h4' } as const

export const titleClass = (size: keyof typeof SIZE = 'h2') => `font-semibold ${SIZE[size]}`

export function Title({ size = 'h2', as, className, ...props }: React.ComponentProps<'h2'> & { size?: keyof typeof SIZE; as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' }) {
  const Tag = as ?? TAG[size]
  return <Tag className={cn(titleClass(size), className)} {...props} />
}
