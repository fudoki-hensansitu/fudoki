// 見つからない頁（404）。頁の loader は 404 の HTTPException を受けたら、文字だけの応答ではなく見つからない頁の props を返し、
// layout（サイドバー）の中に nav/not-found.tsx を描く。Void の頁は 200 で描くので、印の header を見て middleware/01.site.ts が HTML の状態を 404 にする
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'

export type NotFoundProps = { kind: 'not-found' }

/** loader が立て、middleware が読んで外す印 */
export const NOT_FOUND_HEADER = 'X-Fudoki-Not-Found'

export function notFoundProps(c: Context): NotFoundProps {
  c.header(NOT_FOUND_HEADER, '1')
  c.header('Cache-Control', 'public, max-age=300')
  // 頁を移るときの JSON は 200 のままなので、CDN（Void の ISR）に置かない。後から収録した自治体の頁が1時間見つからないままにならないように
  c.header('x-revalidate', '0')
  return { kind: 'not-found' }
}

/** 頁でない path。API（/api/*）とファイル（最後の段に . がある。/assets/*.js など）は、頁の pattern に当たっても文字だけの 404 のままにする */
const NOT_A_PAGE = /^\/api(\/|$)|\.[^/]*$/

/** 404 の HTTPException を見つからない頁の props に変える。ほかの失敗（API に繋がらない 502、年度の段の無い頁の 301）と頁でない path の 404 はそのまま投げる */
export async function orNotFound<T>(c: Context, load: () => T | Promise<T>): Promise<T | NotFoundProps> {
  try {
    return await load()
  } catch (e) {
    if (e instanceof HTTPException && e.status === 404 && !NOT_A_PAGE.test(c.req.path)) return notFoundProps(c)
    throw e
  }
}

export const NOT_FOUND_HEAD = {
  title: '頁が見つかりません — 風土記',
  meta: [{ name: 'robots', content: 'noindex' }],
  link: [],
}
