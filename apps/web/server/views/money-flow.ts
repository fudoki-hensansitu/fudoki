// show_money_flow: 予算・決算のタブの頭の「入る→使う」を会話に描く。頁の loader と同じ関数（款項目・歳入・人口）から incomeFlowOf で組み、頁と会話で数字をずらさない
import { dynamicTool, jsonSchema } from 'ai'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../../jurisdiction/domains'
import { incomeFlowOf } from '../../jurisdiction/app/income-flow-data'
import { reiwa, type Drill } from '../../jurisdiction/types'
import { subjectsOf, subjectTree, yearTabPath } from '../app-data'
import type { Env } from '../env'
import { loadCatalogEntry, loadRevenueFlow, loadRevenueSetsuByMoku } from '../jurisdiction'
import { logError } from '../log'
import { loadRevenue } from '../revenue'
import { SHOWN, toModelOutput, viewError, viewResult } from './result'

export const SHOW_MONEY_FLOW_TOOL = 'show_money_flow'

const DESCRIPTION =
  '自治体の一般会計の1年度の「入る→使う」（歳入の款から一般会計を通って歳出の分野へ流れる図と、総額・1人あたり）を、自治体の頁の予算・決算タブと同じ図で利用者の画面に描く。' +
  'まち全体のお金の出入り・何にいくら使っているかの全体像を聞かれ、図で見せる方が文より分かりやすいときに使う。' +
  'document_kind は initial（当初予算）か settlement（決算）。歳入を収録していない年度・資料は描けない。'

const yenText = (yen: number) => (yen >= 1e8 ? `${Math.round(yen / 1e8).toLocaleString('ja-JP')}億円` : `${Math.round(yen).toLocaleString('ja-JP')}円`)

/** 住民税（個人）を引くために、〇民税の項の目に節を足す（頁も節を読んでから 1人あたりを出す） */
async function withResidentSetsu(env: Env, code: string, year: number, kind: 'initial' | 'settlement', revenue: Drill[]): Promise<Drill[]> {
  const kou = revenue.flatMap((k) => k.kou).find((o) => /(区|市町村|市|町|村)民税$/.test(o.name))
  if (!kou || kou.moku.some((m) => m.name.includes('個人'))) return revenue
  const setsu = await loadRevenueSetsuByMoku(env, code, year, kou.moku.map((m) => m.id), kind)
  return revenue.map((k) => ({ ...k, kou: k.kou.map((o) => (o === kou ? { ...o, moku: o.moku.map((m) => ({ ...m, setsu: setsu.get(m.id) ?? [] })) } : o)) }))
}

export function showMoneyFlowTool(env: Env) {
  return dynamicTool({
    description: DESCRIPTION,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        jurisdiction_code: { type: 'string', pattern: '^\\d{6}$', description: '6桁の自治体コード' },
        fiscal_year: { type: 'integer', minimum: 2000, maximum: 2100, description: '西暦の年度' },
        document_kind: { type: 'string', enum: ['initial', 'settlement'] },
      },
      required: ['jurisdiction_code', 'fiscal_year', 'document_kind'],
      additionalProperties: false,
    }),
    execute: async (input) => {
      const { jurisdiction_code: code, fiscal_year: year, document_kind: kind } = input as { jurisdiction_code: string; fiscal_year: number; document_kind: 'initial' | 'settlement' }
      const label = kind === 'initial' ? '当初予算' : '決算'
      try {
        const entry = await loadCatalogEntry(env, code)
        if (!entry) return viewError('収録していない自治体です')
        if (!(kind === 'initial' ? entry.initialYears : entry.settlementYears).includes(year)) return viewError(`${reiwa(year)}の${label}は収録していません`)
        const [subjects, docs, revenue] = await Promise.all([subjectsOf(env, code, year, kind), loadRevenue(env, code), loadRevenueFlow(env, code, year, kind)])
        const doc = docs.find((d) => d.year === year && d.kind === kind && d.total > 0)
        // 使うだけの図にはしない（頁も歳入の無い資料では入る→使うを出さない）
        if (!doc) return viewError(`${reiwa(year)}の${label}の歳入を収録していないので、入る→使うは描けません。使い道だけなら search_expenditure_subjects などで答えてください`)
        const tree = subjectTree(subjects.rows)
        const expTotal = tree.kan.reduce((s, k) => s + k.yen, 0)
        const fields = [...DOMAIN_FRAMES, OTHER_FRAME]
          .map((f) => ({ id: f.id, name: f.name, yen: tree.fields[f.id] ?? 0 }))
          .filter((f) => f.yen > 0)
          .sort((a, b) => Number(a.id === 'other') - Number(b.id === 'other') || b.yen - a.yen)
        const flow = incomeFlowOf({ doc, revenue: await withResidentSetsu(env, code, year, kind, revenue), phase: kind, expTotal, fields, pop: entry.population?.people ?? 0 })
        const message = [
          SHOWN,
          `${entry.name}の${reiwa(year)}${label}（一般会計）: ${flow.words[0]}お金 ${yenText(flow.revenue)}、${flow.words[1]}お金 ${yenText(flow.expenditure)}。`,
          `${flow.words[0]}お金の多い順: ${flow.incoming.slice(0, 3).map((n) => `${n.label} ${yenText(n.yen)}`).join('、')}。`,
          `${flow.words[1]}お金の多い分野: ${flow.outgoing.filter((n) => n.tone === 'out').slice(0, 3).map((n) => `${n.label} ${yenText(n.yen)}`).join('、')}。`,
          doc.origin ? `出典: ${doc.origin.title} ${doc.origin.url}` : '',
        ].filter(Boolean).join('\n')
        return viewResult(message, {
          kind: 'money_flow',
          v: 1,
          data: { name: entry.name, year, document_kind: kind, flow, path: yearTabPath(entry, year, kind) },
        })
      } catch (e) {
        logError(e)
        return viewError('風土記の API から読めませんでした')
      }
    },
    toModelOutput,
  })
}
