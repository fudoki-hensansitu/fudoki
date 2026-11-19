// 公開の MCP の tool の一覧。公開の /mcp（app.ts）と、web のアシスタントの tool（web-ops.ts の assistantTools）が同じ並び・説明・schema を使う
import { evaluationTools } from './evaluation/tools'
import { expenditureTools } from './expenditure/tools'
import { jurisdictionTools } from './jurisdiction/tools'
import { projectTools } from './project/tools'
import { revenueTools } from './revenue/tools'
import type { Tool } from './shared/tool'

/** MCP の tool。並びは tools/list の順 */
export const tools: Tool[] = [
  jurisdictionTools.list,
  expenditureTools.searchSubjects,
  expenditureTools.searchDetails,
  expenditureTools.getLine,
  revenueTools.get,
  revenueTools.searchSubjects,
  revenueTools.searchDetails,
  revenueTools.getLine,
  evaluationTools.get,
  evaluationTools.getSheet,
  evaluationTools.searchSheets,
  projectTools.get,
  projectTools.search,
]
