// まち比べの問いの頁（/compare/debt-per-person など）。大きな地図と、選んだまちの札。問いの slug が違えば 404
import { defineHandler, defineHead } from 'void'
import { HTTPException } from 'hono/http-exception'
import { questionOf, type CompareMap } from '@fudoki/fiscal/compare'
import { BASE, FUDOKI_ORIGIN } from '../../compare/lib/site'
import { EMPTY_MAP, loadCompareMap } from '../../compare/server/map'
import type { Env } from '../../server/fudoki'

export type Props = { slug: string; map: CompareMap; failed: boolean }

const notFound = () => new HTTPException(404, { res: new Response('Not Found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }) })

export const loader = defineHandler<Props>(async (c) => {
  const slug = c.req.param('question') ?? ''
  if (!questionOf(slug)) throw notFound()
  try {
    return { slug, map: await loadCompareMap(c.env as unknown as Env, c.req.raw.headers), failed: false }
  } catch {
    return { slug, map: EMPTY_MAP, failed: true }
  }
})

export const head = defineHead<Props>((_c, props) => {
  const q = questionOf(props.slug)
  const title = `${q?.title ?? 'まち比べ'} — まち比べ — 風土記`
  const canonical = `${FUDOKI_ORIGIN}${BASE}/${props.slug}`
  const description = q?.note ?? ''
  return {
    title,
    link: [{ rel: 'canonical', href: canonical }],
    meta: [
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
    ],
  }
})
