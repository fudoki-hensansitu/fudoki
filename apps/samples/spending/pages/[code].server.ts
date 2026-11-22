// まちのレシートの頁（/<自治体コード>?year=）。風土記の本体から、その年度（無ければ最新）の1年度のデータと、本体での頁の path を読む。
// 収録の無い自治体・頁に無い年度は 404。シェアされたリンクもこの頁で、OG 画像はそのまちのその年度の札とレシート（本体が描く）
import { defineHandler, defineHead } from 'void'
import { HTTPException } from 'hono/http-exception'
import { SITE_ORIGIN, pageTitle, type Snapshot, type TownEntry } from '../lib/fudoki'
import { DESCRIPTION } from '../lib/copy'
import { fudokiFetch, loadSnapshot, type Env } from '../server/fudoki'

export type Props = { d: Snapshot; town: TownEntry }

const notFound = () => new HTTPException(404, { res: new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) })

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const code = c.req.param('code') ?? ''
  const yearText = c.req.query('year')
  if (!/^\d{6}$/.test(code) || (yearText !== undefined && !/^\d{4}$/.test(yearText))) throw notFound()
  const headers = c.req.raw.headers
  const [d, towns] = await Promise.all([
    loadSnapshot(env, headers, code, yearText === undefined ? undefined : Number(yearText)),
    fudokiFetch(env, headers, `/api/jurisdictions?code=${code}`).then((r) => (r.ok ? (r.json() as Promise<TownEntry[]>) : [])),
  ])
  const town = towns[0]
  if (!d || !town || !d.years[String(d.year)]) throw notFound()
  // 「どこへ行った？」は使い終えたお金の話なので、年度の指定が無ければ、使う予定の当初予算ではなく最新の決算から見せる（決算が無いまちは当初予算のまま）
  const settled = Object.entries(d.kinds).filter(([, k]) => k === 'settlement').map(([y]) => Number(y)).sort((a, b) => b - a)[0]
  if (yearText === undefined && d.kinds[String(d.year)] !== 'settlement' && settled !== undefined) {
    const s = await loadSnapshot(env, headers, code, settled)
    if (s && s.years[String(s.year)]) return { d: s, town }
  }
  return { d, town }
})

export const head = defineHead<Props>((_c, { d, town }) => {
  const title = pageTitle(town.name, d.year)
  const url = `${SITE_ORIGIN}/${town.code}?year=${d.year}`
  return {
    title,
    meta: [
      { name: 'description', content: DESCRIPTION },
      { property: 'og:title', content: title },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:url', content: url },
      // 人口が無くレシートを描けないまちは、本体が全頁共通の OG 画像へ回す
      { property: 'og:image', content: `${SITE_ORIGIN}/jurisdictions/${town.code}/receipt.png?year=${d.year}` },
    ],
    link: [{ rel: 'canonical', href: url }],
  }
})
