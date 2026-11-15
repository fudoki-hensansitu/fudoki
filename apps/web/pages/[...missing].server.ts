// どの頁にも当たらない path（/a/b/c/d/e/f など）。Void は catch-all を最後に当てるので、ほかの頁・routes・静的資産を先に通す
import { HTTPException } from 'hono/http-exception'
import { defineHandler, defineHead } from 'void'
import { notFound } from './[prefecture]/_loader'
import { NOT_FOUND_HEAD, orNotFound, type NotFoundProps } from '../server/not-found'

export const loader = defineHandler<NotFoundProps>((c) =>
  orNotFound(c, (): never => {
    throw new HTTPException(404, { res: notFound() })
  }),
)
export const head = defineHead(() => NOT_FOUND_HEAD)
