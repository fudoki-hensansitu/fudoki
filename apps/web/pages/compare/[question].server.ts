// まち比べの問いの頁（/compare/debt-per-person など）。大きな地図と、選んだまちの札。問いの slug が違えば 404
import { defineHandler, defineHead } from 'void'
import { HTTPException } from 'hono/http-exception'
import { questionOf } from '../../compare/questions'
import { loadCompareMap, type CompareMap } from '../../server/compare-map'
import type { Env } from '../../server/env'
import { notFound } from '../[prefecture]/_loader'

export type Props = { slug: string; map: CompareMap; failed: boolean }

export const loader = defineHandler<Props>(async (c) => {
  const slug = c.req.param('question') ?? ''
  if (!questionOf(slug)) throw new HTTPException(404, { res: notFound() })
  const env = c.env as unknown as Env
  try {
    return { slug, map: await loadCompareMap(env), failed: false }
  } catch {
    c.header('x-revalidate', '0')
    return { slug, map: { prefecture: '', cols: 0, rows: 0, year: null, towns: [] }, failed: true }
  }
})

export const head = defineHead<Props>((_c, props) => {
  const q = questionOf(props.slug)
  return { title: `${q?.title ?? 'まち比べ'} — まち比べ — 風土記`, meta: [{ name: 'description', content: q?.note ?? '' }] }
})
