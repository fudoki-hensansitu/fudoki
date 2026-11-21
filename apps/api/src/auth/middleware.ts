// 公開の REST（/v1/*、出典の PDF の中継を除く）に API キーを求める middleware。kill switch より前に置き、資格情報の無い要求は D1 を読まずに断る。
import type { Context, Next } from 'hono'
import { routePath } from 'hono/route'
import { errorBody } from '../errors'
import type { AppEnv } from '../shared/context'
import { AuthUnavailable, blockIp, bearerToken, cachedVerdict, ipBlocked, malformedKey, verifyRemote, type AuthDeps, type Verdict } from './api-key'

/** 資格情報らしい query の名前。値は使わずに 400 にする（URL はログや履歴に残る） */
const CREDENTIAL_QUERY = ['api_key', 'key', 'token', 'access_token']

const challenge = (invalid: boolean) => (invalid ? 'Bearer error="invalid_token"' : 'Bearer')

export function apiKeyAuth(deps: AuthDeps, isPublic: (path: string) => boolean) {
  return async (c: Context<AppEnv>, next: Next) => {
    if (isPublic(c.req.path)) return next()
    const query = new URL(c.req.url).searchParams
    if (CREDENTIAL_QUERY.some((name) => query.has(name)))
      return c.json(errorBody('INVALID_ARGUMENT', 'API キーは query に付けず、Authorization: Bearer <API キー> の header で送ってください'), 400)

    const key = bearerToken(c.req.header('authorization'))
    if (!key) return c.json(errorBody('UNAUTHENTICATED', 'Authorization: Bearer <API キー> の header が要ります。キーは https://auth.fudoki.dev で発行できます'), 401, { 'WWW-Authenticate': challenge(false) })

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    let verdict: Verdict
    try {
      if (malformedKey(key)) verdict = { kind: 'invalid' }
      else {
        const cached = await cachedVerdict(deps, key)
        if (cached) verdict = cached
        else {
          // 検証に失敗し続けた IP は、WorkOS を呼ばずに断る（でたらめなキーで WorkOS の呼び出しの上限を使い切らせない）
          if (await ipBlocked(deps, ip)) return tooMany(c)
          verdict = await verifyRemote(deps, c.env, key)
        }
      }
    } catch (e) {
      if (!(e instanceof AuthUnavailable)) throw e
      return c.json(errorBody('UNAVAILABLE', 'API キーを確かめられませんでした。時間をおいて試してください'), 503, { 'Retry-After': '30' })
    }

    if (verdict.kind === 'invalid') {
      const { success } = await c.env.API_KEY_FAILURES.limit({ key: ip })
      if (!success) {
        await blockIp(deps, ip)
        return tooMany(c)
      }
      return c.json(errorBody('UNAUTHENTICATED', 'API キーが無効です'), 401, { 'WWW-Authenticate': challenge(true) })
    }
    if (verdict.kind === 'denied') return c.json(errorBody('PERMISSION_DENIED', verdict.reason), 403)

    if (!(await c.env.API_CALLER_LIMIT.limit({ key: verdict.userId })).success) return tooMany(c)

    c.set('caller', { userId: verdict.userId, credential: 'api_key' })
    const started = Date.now()
    await next()
    // 1要求1行。IP・User-Agent・問い合わせの引数は書かない
    c.env.API_CALLS.writeDataPoint({
      indexes: [verdict.userId],
      blobs: [verdict.userId, 'api_key', '', routePath(c, -1)],
      doubles: [c.res.status, Date.now() - started],
    })
  }
}

const tooMany = (c: Context<AppEnv>) => c.json(errorBody('RESOURCE_EXHAUSTED', '呼び出しが多すぎます。時間をおいて試してください'), 429, { 'Retry-After': '60' })
