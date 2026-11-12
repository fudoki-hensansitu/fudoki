// ページの token: base64url(JSON {o: offset, h: 問い合わせの指紋})。
import { z } from 'zod'
import { invalid } from '../errors'
import { DEFAULT_PAGE_SIZE, MAX_OFFSET, MAX_PAGE_SIZE } from './search'

export const NEXT_PAGE_TOKEN_HELP = `次のページの token。無ければ null。位置は ${MAX_OFFSET} 件目までで、それ以上は null になるので、条件を絞って問い合わせる。`

export const nextPageToken = z.string().nullable().describe(NEXT_PAGE_TOKEN_HELP)

export const pageTokenOf = (keep: string) =>
  z
    .string()
    .max(512)
    .regex(/^[A-Za-z0-9_-]*$/, 'page_token の形式が不正です')
    .optional()
    .describe(`next_page_token from the previous response. Keep ${keep} unchanged.`)

const pageSizeDescription = (max: number, def: number, what = 'results') => `Number of ${what} per page (1–${max}; default ${def}).`
/** MCP は型を強制しない整数、REST の query は文字列から整数にする */
export const pageSize = (max = MAX_PAGE_SIZE, def = DEFAULT_PAGE_SIZE, what?: string) =>
  z.int().min(1).max(max).default(def).describe(pageSizeDescription(max, def, what))
export const queryPageSize = (max = MAX_PAGE_SIZE, def = DEFAULT_PAGE_SIZE, what?: string) =>
  z.coerce.number().int().min(1).max(max).default(def).describe(pageSizeDescription(max, def, what))

const b64 = (s: string) => btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const unb64 = (s: string) => atob(s.replaceAll('-', '+').replaceAll('_', '/'))

async function fingerprint(parts: unknown[]): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(parts))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function encodeToken(offset: number, parts: unknown[]): Promise<string> {
  return b64(JSON.stringify({ o: offset, h: await fingerprint(parts) }))
}

/** 次の位置が上限を超えるなら token を出さない（出しても次の要求が 400 になるだけ）。 */
export async function nextToken(offset: number, parts: unknown[]): Promise<string | null> {
  return offset > MAX_OFFSET ? null : encodeToken(offset, parts)
}

export async function decodeToken(token: string | undefined, parts: unknown[]): Promise<number> {
  if (!token) return 0
  let parsed: { o?: unknown; h?: unknown } | null
  try {
    parsed = JSON.parse(unb64(token))
  } catch {
    throw invalid('page_token が不正です')
  }
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.o !== 'number' || !Number.isSafeInteger(parsed.o) || parsed.o < 0)
    throw invalid('page_token が不正です')
  if (parsed.o > MAX_OFFSET)
    throw invalid(`page_token の位置が上限（${MAX_OFFSET}）を超えています。条件を絞ってください`)
  if (parsed.h !== (await fingerprint(parts)))
    throw invalid('page_token は別の問い合わせのものです。page_size 以外の入力を変えずに渡してください')
  return parsed.o
}

/** 合計件数（total_size）を数える上限。これを超えたら数えるのをやめ、上限の値と打ち切ったことを返す（D1 が読む行もここで止まる） */
export const MAX_TOTAL_SIZE = 10_000
