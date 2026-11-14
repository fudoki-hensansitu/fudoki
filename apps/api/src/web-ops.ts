// web（風土記のサイト）だけが内部の RPC（entrypoint: Web、web-entrypoint.ts）で呼ぶ操作。公開の REST・MCP と同じ問い合わせ（queries.ts）と入力の schema を使い、入口だけを分ける（ADR 0044）。
// bun の試験は cloudflare:workers を読めないので、処理はここに置く。型（WebOps）は web が @fudoki/api/rpc から import する
import { z } from 'zod'
import type { Env } from './db'
import { ApiError } from './errors'
import { budgetProposalTools } from './budget-proposal/tools'
import { evaluationTools } from './evaluation/tools'
import { expenditureTools } from './expenditure/tools'
import { jurisdictionTools } from './jurisdiction/tools'
import { getJurisdiction } from './jurisdiction/queries'
import { JurisdictionDetail } from './jurisdiction/model'
import { ExpenditureList, ExpenditureListInput, SimilarInput, SimilarList } from './expenditure/model'
import { listExpenditures, similarExpenditures } from './expenditure/queries'
import { projectTools } from './project/tools'
import type { Ctx } from './shared/context'
import { JurisdictionCode } from './shared/model'

const op = <I extends z.ZodObject, O extends z.ZodType>(input: I, output: O, run: (ctx: Ctx, input: z.output<I>) => Promise<unknown>) => ({ input, output, run })
const ofTool = <T extends { input: z.ZodObject; output: z.ZodType; run: (ctx: Ctx, input: Record<string, unknown>) => Promise<unknown> }>(t: T) => op(t.input as T['input'], t.output as T['output'], (ctx, input) => t.run(ctx, input as Record<string, unknown>))

/** web が呼べる操作。名前は公開の MCP の tool と同じ（get_jurisdiction は REST だけ、list_expenditures・search_similar_expenditures は web だけにある操作） */
export const WEB_OPS = {
  list_jurisdictions: ofTool(jurisdictionTools.list),
  get_jurisdiction: op(z.strictObject({ jurisdiction_code: JurisdictionCode }), JurisdictionDetail, (ctx, input) => getJurisdiction(ctx, input.jurisdiction_code)),
  // まち比べ。比べる資料の歳出の根の額と、似たまち（全自治体の額を web へ渡さず、D1 で並べて上位だけを返す）
  list_expenditures: op(ExpenditureListInput, ExpenditureList, (ctx, input) => listExpenditures(ctx, input)),
  search_similar_expenditures: op(SimilarInput, SimilarList, (ctx, input) => similarExpenditures(ctx, input)),
  search_expenditure_subjects: ofTool(expenditureTools.searchSubjects),
  search_expenditure_details: ofTool(expenditureTools.searchDetails),
  get_expenditure_line: ofTool(expenditureTools.getLine),
  get_evaluation: ofTool(evaluationTools.get),
  get_evaluation_sheet: ofTool(evaluationTools.getSheet),
  search_evaluation_sheets: ofTool(evaluationTools.searchSheets),
  get_budget_proposal: ofTool(budgetProposalTools.get),
  search_budget_measures: ofTool(budgetProposalTools.searchMeasures),
  get_project: ofTool(projectTools.get),
  search_projects: ofTool(projectTools.search),
}

export type WebOpName = keyof typeof WEB_OPS
export type WebOpInput<N extends WebOpName> = z.input<(typeof WEB_OPS)[N]['input']>
export type WebOpOutput<N extends WebOpName> = z.output<(typeof WEB_OPS)[N]['output']>
/** 失敗は投げずに返す（RPC を越えると例外の種類が失われるため）。status は公開の REST と同じ */
export type WebResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string }

/** web の Worker が持つ binding の型（Service Binding・entrypoint Web） */
export interface WebRpc {
  call<N extends WebOpName>(name: N, input: WebOpInput<N>): Promise<WebResult<WebOpOutput<N>>>
  /** アシスタントの MCP。公開の /mcp と同じ tool を、同じ JSON-RPC で受ける */
  mcp(request: Request): Promise<Response>
}

/** kill switch: control の serving が 'on' 以外なら止める。読めないときも止める（公開の口と同じ） */
export async function serving(db: Env['DB']): Promise<boolean> {
  try {
    const row = await db.prepare(`SELECT value FROM control WHERE key = 'serving'`).first<{ value: string }>()
    return row?.value === 'on'
  } catch {
    return false
  }
}

export async function callWebOp(env: Env, name: string, input: unknown): Promise<WebResult<unknown>> {
  const fail = (status: number, code: string, message: string) => ({ ok: false as const, status, code, message })
  const target = Object.hasOwn(WEB_OPS, name) ? WEB_OPS[name as WebOpName] : undefined
  if (!target) return fail(404, 'NOT_FOUND', `存在しない操作です: ${name}`)
  if (!(await serving(env.DB))) return fail(503, 'UNAVAILABLE', '提供を停止しています')
  const parsed = target.input.safeParse(input)
  if (!parsed.success) return fail(400, 'INVALID_ARGUMENT', parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; '))
  try {
    return { ok: true, value: await (target.run as (ctx: Ctx, input: unknown) => Promise<unknown>)({ db: env.DB }, parsed.data) }
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.code, e.message)
    // 想定外の例外の詳細（SQL のエラーなど）は返さず、ログにだけ出す
    console.error(e)
    return fail(500, 'INTERNAL', '内部エラー')
  }
}
