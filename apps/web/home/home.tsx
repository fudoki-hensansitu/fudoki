// ホーム（/）。住んでいるまちを選ぶ欄（onboarding.tsx）と、ほかのまちを見る検索。
// 選んだ時点でそのまちに決め、そのまちの頁へ移す。住んでいるまちを選んだ人がまたホームへ来たら、そのまちの頁へ移す（home/redirect.ts）。
// 選んだ直後のオンボーディング（予算を数え上げてレシートを刷り、興味のある分野を選ぶ）は一旦外した（2026-11-20 yuito）。
// うちのまちは1つで、ブラウザ（localStorage）にだけ置く
import * as React from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '../nav/link'
import { Footer } from '../nav/footer'
import { Emblem } from './town-picker'
import type { MapEntry } from '../jurisdiction/index-table'
import { useMyTown } from './towns'
import { useRouter } from '@void/react'
import { OtherTowns, AskTown, Intro } from './onboarding'
import { Title } from '@/components/ui/title'

export interface Featured {
  code: string
  name: string
  path: string
  prefecture: string
  vision?: string
  /** 自治体の頁で選べる年度のうち、事業評価を収録した最新の年度。札はその年度の事業のタブへ繋ぐ */
  evalYear?: number
}

export interface HomeProps {
  /** 自治体の一覧を読めたか。読めなければ、名前で探す欄の代わりに読み込めないと出す */
  listed: boolean
  /** くわしい頁（事業評価・新しく始めること）のある自治体 */
  featured: Featured[]
}

function Loading() {
  return <Skeleton className="h-52 rounded-[24px]" aria-busy="true" />
}

/** まちを選ぶ前のホームで、緑の札の下に置く。他のまちを名前で探す欄と、見本のまち（事業評価か都市像のあるまち）を都市像と並べて開けるようにする。住んでいるまちは変えない */
function FeaturedTowns({ featured, listed }: { featured: Featured[]; listed: boolean }) {
  if (!featured.length && !listed) return null
  return (
    <section className="mt-10" aria-labelledby="featured-towns">
      <Title size="h3" as="h2" id="featured-towns" className="mb-3">他のまちを見る</Title>
      {/* 住んでいるまちは変えずに、そのまちの頁を開く（緑の札の「住んでいるまちを選ぶ」とは別の、地のままの検索欄） */}
      <OtherTowns className="mb-3" />
      <TownList featured={featured} />
    </section>
  )
}

/** 見本のまち（事業評価か都市像のあるまち）を6つまで、紋章・都市像と並べて開けるようにする */
function TownList({ featured }: { featured: Featured[] }) {
  const items = featured.slice(0, 6)
  if (!items.length) return null
  return (
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {items.map((t) => (
        <li key={t.code}>
          <Link href={t.path} className="flex items-center gap-3 rounded-lg px-3 py-3 text-foreground no-underline transition-colors hover:bg-card">
            <Emblem code={t.code} name={t.name} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium">
                {t.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{t.prefecture}</span>
              </span>
              {t.vision ? <span className="block truncate text-xs text-muted-foreground">{t.vision}</span> : null}
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function Home({ listed, featured }: HomeProps) {
  const { ready, town, set } = useMyTown()
  const router = useRouter()
  // 住んでいるまちを選んでいれば、そのまちの頁へ移す。頁を読み直して来たときは <head> の script（home/redirect.ts）が先に移すので、
  // ここに来るのは頁を読み直さずにホームへ来たとき（ロゴなど）と、いま選んだとき
  const leaving = ready && !!town
  React.useEffect(() => {
    if (leaving) void router.visit(town!.path, { replace: true })
  }, [leaving])
  const pick = (e: MapEntry) => set({ code: e.code, name: e.name, path: e.path })
  return (
    <main className="mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-4xl flex-col px-4 pt-10 pb-28 sm:px-8 sm:pt-14 md:min-h-svh md:pb-10">
      <Intro mode={!ready ? 'hidden' : 'full'} />
      {!ready || leaving ? <Loading /> : (
        <>
          <AskTown listed={listed} onPick={pick} />
          <FeaturedTowns featured={featured} listed={listed} />
        </>
      )}
      <Footer />
    </main>
  )
}
