// 自治体の頁の事業をブラウザが読む口（/api/projects）。サーバーが api の内部の RPC で読み（jurisdiction/app/api.ts の read*）、ブラウザは api.fudoki.dev を直接は呼ばない（ADR 0044）。
// 誰でも呼べるので、IP ごとの流量と引数の形の検査で守る。細かい値の検査は api の操作の schema に任せ、その 400 をそのまま返す
import { readListPage, readProjectFull, readProjectOfDetail, type Kind, type ListQuery } from '../jurisdiction/app/api'
import type { Env, RateLimiter } from './env'
import { apiCall, FudokiApiError } from './fudoki-api'
import { clientIp, errorResponse, HttpError, json, rateLimit, readJson } from './http'
import { VIEW_RATE_LIMIT } from './limits'

/** 一覧の条件の body の上限（科目の ID が100個並んでも収まる） */
const MAX_BODY_BYTES = 16 * 1024
const MAX_TEXT = 512
const ID = /^[0-9a-f]{64}$/
const KINDS: readonly Kind[] = ['initial', 'settlement']
const FILTERS: readonly ListQuery['filter'][] = ['all', 'new', 'ended']

const invalid = (message: string) => new HttpError(400, 'INVALID_ARGUMENT', message)
const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind)
const yearOf = (v: unknown) => {
  const n = typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1900 || n > 2999) throw invalid('年度の形が違います')
  return n
}
const kindOf = (v: unknown) => {
  if (!isKind(v)) throw invalid('資料の種類の形が違います')
  return v
}

/** body の一覧の条件。形だけを確かめ、知らない鍵は落とす */
function listQueryOf(v: unknown): ListQuery {
  const q = (v ?? {}) as Record<string, unknown>
  if (typeof q !== 'object' || typeof q.code !== 'string' || !/^\d{6}$/.test(q.code)) throw invalid('自治体コードの形が違います')
  if (!FILTERS.includes(q.filter as ListQuery['filter'])) throw invalid('filter の形が違います')
  if (q.prevKind !== undefined && !isKind(q.prevKind)) throw invalid('prevKind の形が違います')
  if (q.subjects !== undefined && !(Array.isArray(q.subjects) && q.subjects.length <= 100 && q.subjects.every((s) => typeof s === 'string' && ID.test(s)))) throw invalid('科目の ID の形が違います')
  if (q.q !== undefined && !(typeof q.q === 'string' && q.q.length <= MAX_TEXT)) throw invalid('探す語の形が違います')
  return {
    code: q.code,
    year: yearOf(q.year),
    kind: kindOf(q.kind),
    filter: q.filter as ListQuery['filter'],
    ...(q.prevKind !== undefined ? { prevKind: q.prevKind as Kind } : {}),
    ...(q.subjects !== undefined ? { subjects: q.subjects as string[] } : {}),
    ...(q.q !== undefined ? { q: q.q as string } : {}),
  }
}

async function respond(env: Env, request: Request, run: () => Promise<unknown>): Promise<Response> {
  try {
    await rateLimit(env.VIEW_RATE_LIMIT as RateLimiter | undefined, clientIp(request), VIEW_RATE_LIMIT.period)
    return json(await run())
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    if (e instanceof FudokiApiError && e.status < 500) return errorResponse(new HttpError(e.status, e.code, e.message))
    return errorResponse(new HttpError(502, 'UNAVAILABLE', '風土記の API に繋がりませんでした'))
  }
}

/** POST /api/projects: 事業の一覧の1頁（body は { query, token? }） */
export function projectListResponse(env: Env, request: Request): Promise<Response> {
  return respond(env, request, async () => {
    const body = (await readJson(request, MAX_BODY_BYTES)) as Record<string, unknown> | null
    const token = body?.token
    if (token !== undefined && !(typeof token === 'string' && token.length <= MAX_TEXT)) throw invalid('token の形が違います')
    return readListPage(apiCall(env), listQueryOf(body?.query), token)
  })
}

/** GET /api/projects?detail=&year=&kind=: 施策・評価シートを紐付けた内訳が載る事業 */
export function projectOfDetailResponse(env: Env, request: Request): Promise<Response> {
  return respond(env, request, async () => {
    const p = new URL(request.url).searchParams
    const detail = p.get('detail') ?? ''
    if (!ID.test(detail)) throw invalid('内訳の ID の形が違います')
    return readProjectOfDetail(apiCall(env), detail, yearOf(p.get('year')), kindOf(p.get('kind')))
  })
}

/** GET /api/projects/:id?year=&kind=: 事業の詳細 */
export function projectResponse(env: Env, request: Request, id: string): Promise<Response> {
  return respond(env, request, async () => {
    if (!ID.test(id)) throw invalid('事業の ID の形が違います')
    const p = new URL(request.url).searchParams
    return readProjectFull(apiCall(env), id, yearOf(p.get('year')), kindOf(p.get('kind')))
  })
}
