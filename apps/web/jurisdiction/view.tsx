// 自治体の頁（都道府県・市区町村）の本文。収録の無い自治体は案内だけを出す
import './jurisdiction.css'
import * as React from 'react'
import { useRouter } from '@void/react'
import { Link } from '../nav/link'
import { RequestTown } from '../nav/request-town'
import type { JurisdictionProps } from '../pages/[prefecture]/_loader'
import { Skeleton } from '@/components/ui/skeleton'
import { AppPage } from './app/app-page'
import { Resources } from './app/resource'

export function JurisdictionView(props: JurisdictionProps) {
  if (props.kind === 'empty')
    return (
      <main className="j-static">
        <h1>{props.entry.name}</h1>
        <p>この自治体の決算は、風土記にまだ収録されていません。</p>
        {props.neighbors.length ? (
          <>
            <h2>同じ都道府県で収録している自治体</h2>
            <p>
              {props.neighbors.map((n, i) => (
                <span key={n.code}>
                  {i ? '・' : ''}
                  <Link href={n.path}>{n.name}</Link>
                </span>
              ))}
            </p>
          </>
        ) : null}
        <p>
          <RequestTown />
        </p>
        <p>
          <Link href="/">ホームでほかのまちを探す</Link>
        </p>
      </main>
    )
  return (
    <div id="j-app">
      {/* 自治体を移ると年度・開いた款などの状態を持ち越さないよう、自治体ごとに描き直す */}
      <AppHost key={props.data.code} {...props} />
    </div>
  )
}

/** 頁のデータの置き場は自治体ごとに1つ持ち、年度・タブを移っても読んだ事業の一覧・詳細を使い回す */
function AppHost(props: Extract<JurisdictionProps, { kind: 'page' }>) {
  const [res] = React.useState(() => new Resources())
  // 本文のデータが届かなかった頁（API に繋がらなかった）は、形の近い skeleton を出して頁を読み直す
  if (!props.snapshot) return <Reload />
  return <AppPage res={res} data={props.data} snapshot={props.snapshot} flow={props.flow} sitekey={props.sitekey} initialField={props.field} initialTab={props.tab} />
}

/** 読み直す間を、回ごとに倍にする上限 */
const RELOAD_MAX_MS = 30_000

function Reload() {
  const router = useRouter()
  const [wait, setWait] = React.useState(1000)
  React.useEffect(() => {
    const timer = setTimeout(() => void router.refresh({ preserveState: true, preserveScroll: true }).catch(() => {}).finally(() => setWait((w) => Math.min(w * 2, RELOAD_MAX_MS))), wait)
    return () => clearTimeout(timer)
  }, [router, wait])
  return <AppSkeleton />
}

function AppSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-7" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-[108px] rounded-2xl" />
      <Skeleton className="h-12 rounded-lg" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )
}
