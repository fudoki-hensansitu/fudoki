// 見つからない頁（404）の本文。サイドバーは layout が残すので、ここは本文の中央に案内と次の一手（ホーム・まちを探す・収録のリクエスト）だけを置く
import * as React from 'react'
import { HouseIcon, MagnifyingGlassIcon, SignpostIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Link } from './link'
import { RequestTown } from './request-town'
import { TownPalette } from './town-palette'

export function NotFound() {
  const [open, setOpen] = React.useState(false)
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
      <Empty className="max-w-lg">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-11 rounded-full text-muted-foreground [&_svg:not([class*='size-'])]:size-6">
            <SignpostIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-lg">お探しの頁は見つかりませんでした</EmptyTitle>
          <EmptyDescription className="text-base">URL が変わったか、まだ収録していない自治体・年度の頁かもしれません。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" nativeButton={false} render={<Link href="/" />}>
              <HouseIcon aria-hidden="true" />
              ホームへ
            </Button>
            <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
              <MagnifyingGlassIcon aria-hidden="true" />
              まちを探す
            </Button>
          </div>
          <RequestTown className="text-sm text-muted-foreground" />
        </EmptyContent>
      </Empty>
      <TownPalette open={open} onOpenChange={setOpen} />
    </main>
  )
}
