// 入る→使うの数字（頁と show_money_flow が同じ incomeFlowOf を使う）
import { expect, test } from 'bun:test'
import { incomeFlowOf } from '../../jurisdiction/app/income-flow-data'
import type { Drill, RevenueDoc } from '../../jurisdiction/types'

const kan = (name: string, yen: number, category: RevenueDoc['kan'][number]['category'] = 'その他') => ({ name, yen, category, page: null })
const docOf = (k: RevenueDoc['kan']): RevenueDoc => ({ year: 2024, kind: 'settlement', total: k.reduce((s, x) => s + (x.yen ?? 0), 0), kan: k, origin: null })
const fields = [{ id: 'fukushi', name: '社会保護', yen: 60 }, { id: 'other', name: 'その他', yen: 20 }]

test('款が8つを超えると多い順に7つを出し、残りを「ほかの収入」にまとめる。入るの和は歳入の総額', () => {
  const doc = docOf(Array.from({ length: 10 }, (_, i) => kan(`款${i}`, (i + 1) * 10)))
  const flow = incomeFlowOf({ doc, phase: 'settlement', expTotal: doc.total, fields, pop: 0 })
  expect(flow.incoming.map((n) => n.label)).toEqual(['款9', '款8', '款7', '款6', '款5', '款4', '款3', 'ほかの収入'])
  expect(flow.incoming.at(-1)!.yen).toBe(10 + 20 + 30)
  expect(flow.incoming.reduce((s, n) => s + n.yen, 0)).toBe(doc.total)
  expect(flow.perIn).toBeNull()
  expect(flow.perOut).toBeNull()
})

test('決算で入るが使うより多い分は「翌年度へ繰り越すお金など」として使うに足し、両側の和を揃える', () => {
  const doc = docOf([kan('特別区税', 70, 'まちの税'), kan('国庫支出金', 30)])
  const flow = incomeFlowOf({ doc, phase: 'settlement', expTotal: 80, fields, pop: 0 })
  expect(flow.outgoing.at(-1)).toMatchObject({ id: 'rest', yen: 20, tone: 'rest' })
  expect(flow.outgoing.reduce((s, n) => s + n.yen, 0)).toBe(flow.revenue)
  expect(flow.words).toEqual(['入った', '使った'])
})

test('1人あたりの入るは住民税（個人）の節の和で割り、住民税の項が無ければまちの税で割る', () => {
  const doc = docOf([kan('特別区税', 70, 'まちの税'), kan('国庫支出金', 30)])
  const line = (name: string, yen: number) => ({ id: name, name, yen })
  const revenue: Drill[] = [{
    kan: line('特別区税', 70),
    kou: [{ ...line('特別区民税', 50), moku: [{ ...line('現年課税分', 50), setsu: [line('個人', 40), line('法人', 10)] }] }],
  }]
  expect(incomeFlowOf({ doc, revenue, phase: 'initial', expTotal: 100, fields, pop: 10 }).perIn).toEqual({ label: '1人あたりの住民税', yen: 4 })
  expect(incomeFlowOf({ doc, phase: 'initial', expTotal: 100, fields, pop: 10 }).perIn).toEqual({ label: '1人あたりの税金', yen: 7 })
  expect(incomeFlowOf({ doc, phase: 'initial', expTotal: 100, fields, pop: 10 }).perOut).toEqual({ label: '1人あたり', yen: 10 })
})
