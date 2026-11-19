// 分野などを示す小さなバッジ。事業の頁と「気になる」の札で同じ形にする
import type * as React from 'react'

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground [&_svg]:size-3">{children}</span>
}
