// 歳入の集約の MCP の tool。REST の route（routes.ts）も同じ説明・schema・処理を使う。
import type { Tool } from '../shared/tool'
import { RevenueInput, RevenueOutput } from './model'
import { getRevenue } from './queries'

const getRevenueDescription =
  'Get revenue (歳入) of one municipality: for each document (fiscal year, document kind) and account, the total and the kan (款) with printed amounts. ' +
  'Settlement amounts are received amounts (収入済額); initial amounts are the initial budget. Never add initial and settlement amounts. The kan add up to total_yen. ' +
  'category is a Fudoki judgment that groups kan of municipal general accounts: local taxes (まちの税), money distributed by the national and prefectural governments without a set purpose (国・都道府県から配られるお金: shared taxes, grants and 地方交付税), ' +
  'national and prefectural disbursements for set purposes (国・都道府県の支出金), borrowing (借入れ) and other. Use list_jurisdictions to find the six-digit code first. ' +
  'Revenue is covered for fewer municipalities than expenditure; an empty list means not covered, not zero.'

export const revenueTools = {
  get: {
    name: 'get_revenue',
    title: 'Revenue by kan',
    description: getRevenueDescription,
    input: RevenueInput,
    output: RevenueOutput,
    run: (ctx, input) => getRevenue(ctx, input as RevenueInput),
  },
} satisfies Record<string, Tool>
