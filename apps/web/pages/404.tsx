import { HouseIcon, SignpostIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Link } from '../nav/link'
import { OtherTowns } from '../home/onboarding'
import { titleVariants } from '@/components/ui/title'

/** 見つからない頁。ホームとまちの検索へ戻す */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl items-center px-4 py-10">
      <Empty className="gap-6">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-11 rounded-full text-muted-foreground [&_svg:not([class*='size-'])]:size-6">
            <SignpostIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className={titleVariants({ size: 'h3' })}>頁が見つかりませんでした</EmptyTitle>
          <EmptyDescription className="text-sm">
            <span className="inline-block">URL が変わったか、</span>
            <span className="inline-block">まだ収録していない頁かもしれません。</span>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-sm gap-3">
          <Button size="lg" className="px-4" nativeButton={false} render={<Link href="/" />}>
            <HouseIcon data-icon="inline-start" aria-hidden="true" />
            ホームへ
          </Button>
          <OtherTowns className="w-full" />
        </EmptyContent>
      </Empty>
    </main>
  )
}
