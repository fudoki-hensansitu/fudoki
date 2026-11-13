// REST の route をまとめ、型（AppType）と web 用の内部の RPC の型（WebRpc）を export する（@fudoki/api/rpc）。
// MCP・middleware は app.ts。ここは定義だけを持ち、web の型検査に Worker の処理を引き込まない。
import { budgetProposalRoutes } from './budget-proposal/routes'
import { evaluationRoutes } from './evaluation/routes'
import { expenditureRoutes } from './expenditure/routes'
import { jurisdictionRoutes } from './jurisdiction/routes'
import { projectRoutes } from './project/routes'
import { routes } from './shared/http'

export const apiRoutes = routes().route('/', jurisdictionRoutes).route('/', expenditureRoutes).route('/', evaluationRoutes).route('/', budgetProposalRoutes).route('/', projectRoutes)

/** 公開の REST の型。web は使わない（web は内部の RPC の WebRpc を使う） */
export type AppType = typeof apiRoutes

/** web が内部の RPC（entrypoint Web）で呼ぶ操作の型（web-ops.ts） */
export type { WebOpInput, WebOpName, WebOpOutput, WebResult, WebRpc } from './web-ops'
