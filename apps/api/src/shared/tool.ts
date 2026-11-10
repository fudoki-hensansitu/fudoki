// MCP の tool。REST の route（各集約の routes.ts）と同じ schema と処理を使う。
import type { z } from 'zod'
import type { Ctx } from './context'

export interface Tool {
  name: string
  /** MCP の tool の title（英語） */
  title: string
  /** MCP の tool の description。REST の route の description にも同じ文を使う */
  description: string
  input: z.ZodObject
  output: z.ZodType
  /** MCP Apps の View（render_expenditure_view）で描けるか */
  view?: boolean
  run(ctx: Ctx, input: Record<string, unknown>): Promise<unknown>
}
