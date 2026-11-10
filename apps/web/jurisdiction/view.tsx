// 自治体の頁（都道府県・市区町村）の本文。収録の無い自治体は案内だけを出す
import './jurisdiction.css'
import { Link } from '@void/react'
import { RequestTown } from '../nav/request-town'
import type { JurisdictionProps } from '../server/pages'
import { Page } from './page'
import { INDEX_PATH } from './types'

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
          <Link href={INDEX_PATH}>収録している自治体を見る</Link>
        </p>
      </main>
    )
  return (
    <div id="j-app">
      {/* 自治体を移ると年度・開いた款などの状態を持ち越さないよう、自治体ごとに描き直す */}
      <Page key={props.data.code} data={props.data} sitekey={props.sitekey} initialYear={props.year} />
    </div>
  )
}
