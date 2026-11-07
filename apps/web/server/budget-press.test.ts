import { describe, expect, test } from 'bun:test'
import { BUDGET_PRESS } from '../jurisdiction/budget-press'

// POINT の抜き出しが、続く「事業の概要」「背景・目的」や頁番号まで取り込んでいないこと（R7 で一度起きた）
describe('予算案のプレス発表の POINT', () => {
  const points = Object.values(BUDGET_PRESS).flatMap((years) => Object.values(years).flatMap((y) => Object.values(y.items).flat().flatMap((p) => p.points)))
  test('POINT の箇条書きの範囲に収まる', () => {
    expect(points.length).toBeGreaterThan(0)
    expect(points.filter((p) => /事業の?概要|背景・目的|―\s*\d+\s*―/.test(p) || p.length > 120 || !p.trim())).toEqual([])
  })
})
