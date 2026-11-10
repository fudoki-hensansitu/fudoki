// REST の route が共有する応答の schema と、入力の検査の失敗を 400 にする hook。
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { errorBody } from '../errors'
import type { AppEnv } from './context'

export const MAX_BODY_BYTES = 16 * 1024

export const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

const json = <S extends z.ZodType>(schema: S) => ({ 'application/json': { schema } })

/** GET の route のエラー応答 */
export const getErrors = {
  400: { description: '入力が不正', content: json(ErrorBody) },
  404: { description: '見つからない', content: json(ErrorBody) },
  503: { description: '提供を止めている', content: json(ErrorBody) },
}

/** POST の route のエラー応答（body の検査を含む） */
export const postErrors = {
  ...getErrors,
  413: { description: `body が ${MAX_BODY_BYTES} バイトを超える`, content: json(ErrorBody) },
  415: { description: 'Content-Type が application/json でない', content: json(ErrorBody) },
}

export const ok = <S extends z.ZodType>(schema: S) => ({ 200: { description: '成功', content: json(schema) } })

/** 入力の検査の失敗を `{error: {code: INVALID_ARGUMENT}}` の 400 にする */
export const validationHook = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, c: { json: (body: unknown, status: 400) => Response }) => {
  if (result.success) return
  const message = result.error!.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ')
  return c.json(errorBody('INVALID_ARGUMENT', message), 400)
}

/** 集約の routes の入れ物 */
export const routes = () => new OpenAPIHono<AppEnv>({ defaultHook: validationHook as never })
