// REST の route をまとめる。型（AppType）は web が Hono RPC（hc<AppType>）で import する（@fudoki/api/rpc）。
// MCP・middleware は app.ts。ここは route の定義だけを持ち、web の型検査に Worker の処理を引き込まない。
import { budgetProposalRoutes } from './budget-proposal/routes'
import { evaluationRoutes } from './evaluation/routes'
import { expenditureRoutes } from './expenditure/routes'
import { jurisdictionRoutes } from './jurisdiction/routes'
import { routes } from './shared/http'

export const apiRoutes = routes().route('/', jurisdictionRoutes).route('/', expenditureRoutes).route('/', evaluationRoutes).route('/', budgetProposalRoutes)

/** web が Hono RPC（hc<AppType>）で呼ぶ REST の型 */
export type AppType = typeof apiRoutes
