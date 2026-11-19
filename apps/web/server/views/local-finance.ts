// show_local_finance: 財政タブの「借金と貯金」「事業に回ったお金」「財政の指標」を会話に描く。数字は get_local_finance と同じ web の D1 から引き、AI には要点だけを渡す
import { dynamicTool, jsonSchema } from 'ai'
import { FINANCE_SECTIONS } from '../../chat/views/schema'
import { jurisdictionPath } from '../../jurisdiction/path'
import { reiwa } from '../../jurisdiction/types'
import type { Env } from '../env'
import { loadCatalogEntry } from '../jurisdiction'
import { loadLocalFinance } from '../local-finance'
import { logError } from '../log'
import { SHOWN, toModelOutput, viewError, viewResult } from './result'

export const SHOW_LOCAL_FINANCE_TOOL = 'show_local_finance'

const DESCRIPTION =
  '自治体の財政の状況（借金と貯金・事業に回ったお金・財政の指標の5年の推移）を、自治体の頁の「財政」タブと同じ図で利用者の画面に描く。' +
  '借金・貯金・財政の健全さを聞かれ、図で見せる方が文より分かりやすいときに使う。数字を確かめたいだけなら get_local_finance を使う。' +
  'sections で描く節を絞れる（debt: 借金と貯金、free: 事業に回ったお金、indicators: 財政の指標）。省くと全部。'

const oku = (yen: number | null) => (yen == null ? '不明' : `${Math.round(yen / 1e8).toLocaleString('ja-JP')}億円`)

export function showLocalFinanceTool(env: Env) {
  return dynamicTool({
    description: DESCRIPTION,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        jurisdiction_code: { type: 'string', pattern: '^\\d{6}$', description: '6桁の自治体コード' },
        sections: { type: 'array', items: { type: 'string', enum: [...FINANCE_SECTIONS] }, minItems: 1, uniqueItems: true },
      },
      required: ['jurisdiction_code'],
      additionalProperties: false,
    }),
    execute: async (input) => {
      const { jurisdiction_code: code, sections } = input as { jurisdiction_code: string; sections?: (typeof FINANCE_SECTIONS)[number][] }
      // D1 の決算状況調は全国の自治体を持つが、頁（と「頁で開く」）は風土記が収録した自治体だけ
      const [entry, finance] = await Promise.all([
        loadCatalogEntry(env, code).catch((e) => {
          logError(e)
          return undefined
        }),
        loadLocalFinance(env, code),
      ])
      if (entry === undefined) return viewError('風土記の API から読めませんでした')
      if (!entry) return viewError('収録していない自治体です。数字だけなら get_local_finance で答えてください')
      const at = finance.at(-1)
      if (!at) return viewError('この自治体の決算の指標はありません')
      const { name, population } = entry
      const message = [
        SHOWN,
        `${name}の財政の状況（${reiwa(at.year)}決算・普通会計・総務省）: 地方債現在高（まちの借金）${oku(at.localBondBalance)}、積立金現在高（まちの貯金）${oku(at.fundBalance)}、` +
          `経常収支比率 ${at.currentBalanceRatio ?? '不明'}%、財政力指数 ${at.fiscalCapabilityIndex ?? '不明'}、実質公債費比率 ${at.realDebtServiceRatio ?? '不明'}%。`,
      ].join('\n')
      return viewResult(message, {
        kind: 'local_finance',
        v: 1,
        data: { name, finance, population, prefecture: code.slice(2, 5) === '000', sections: sections?.length ? sections : [...FINANCE_SECTIONS], path: `${jurisdictionPath(code)}/finance` },
      })
    },
    toModelOutput,
  })
}
