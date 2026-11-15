import { HouseIcon, SignpostIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Link } from '../nav/link'
import { OtherTowns } from '../home/onboarding'
import type { Props } from './404.server'

/** 見つからない頁。自治体の頁の下なら、その自治体の頁への導線を先に出す */
export default function NotFound({ town }: Props) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl items-center px-4 py-10">
      <Empty className="gap-6">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-11 rounded-full text-muted-foreground [&_svg:not([class*='size-'])]:size-6">
            <SignpostIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-xl font-semibold">頁が見つかりませんでした</EmptyTitle>
          <EmptyDescription className="text-[15px]">
            <span className="inline-block">URL が変わったか、</span>
            <span className="inline-block">まだ収録していない頁かもしれません。</span>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-sm gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            {town ? (
              <Button size="lg" className="px-4" nativeButton={false} render={<Link href={town.path} />}>
                {town.name}の頁を見る
              </Button>
            ) : null}
            <Button size="lg" variant={town ? 'outline' : 'default'} className="px-4" nativeButton={false} render={<Link href="/" />}>
              <HouseIcon data-icon="inline-start" aria-hidden="true" />
              ホームへ
            </Button>
          </div>
          <OtherTowns className="w-full" />
        </EmptyContent>
      </Empty>
    </main>
  )
}
