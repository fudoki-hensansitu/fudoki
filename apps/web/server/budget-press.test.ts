import { describe, expect, test } from 'bun:test'
import { BUDGET_PRESS } from '../jurisdiction/budget-press'

// POINT の抜き出しが、続く「事業の概要」「背景・目的」や頁番号まで取り込んでいないこと（R7 で一度起きた）
describe('予算案のプレス発表の POINT', () => {
  const points = Object.values(BUDGET_PRESS).flatMap((years) => Object.values(years).flatMap((y) => y.items.flatMap((p) => p.points)))
  test('POINT の箇条書きの範囲に収まる', () => {
    expect(points.length).toBeGreaterThan(0)
    expect(points.filter((p) => /事業の?概要|背景・目的|―\s*\d+\s*―/.test(p) || p.length > 120 || !p.trim())).toEqual([])
  })
})

// 紐付けは名前の一致か、Jev が確信度0.6以上で選んだものだけ（データを作り直しても崩さない）
test('予算書の内訳への紐付けは名前の一致か確信度0.6以上', () => {
  const links = Object.values(BUDGET_PRESS).flatMap((years) => Object.values(years).flatMap((y) => y.items.flatMap((p) => (p.link ? [p.link] : []))))
  expect(links.length).toBeGreaterThan(0)
  expect(links.filter((l) => l.via === 'jev' && !((l.confidence ?? 0) >= 0.6))).toEqual([])
})
