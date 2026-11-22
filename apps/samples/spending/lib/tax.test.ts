import { describe, expect, test } from 'bun:test'
import { STANDARD, employmentDeduction, residentTax } from './tax'

describe('residentTax', () => {
  test('月給30万・標準（年収360万）は、区市町村 90,400 円・都道府県 59,200 円', () => {
    // 給与所得 244万 − 社会保険料 527,580 − 基礎 43万 = 課税所得 148.2万。所得割 6% 88,920 − 調整控除 1,500 → 87,400 + 均等割 3,000
    expect(residentTax(300_000)).toEqual({ salary: 3_600_000, city: 90_400, pref: 59_200 })
  })

  test('年収110万（月給約9.1万）までは非課税', () => {
    expect(residentTax(91_000)).toEqual({ salary: 1_092_000, city: 0, pref: 0 })
  })

  test('扶養が増えると税は減る', () => {
    const one = residentTax(400_000)
    const family = residentTax(400_000, { ...STANDARD, spouse: true, children: 2 })
    expect(family.city).toBeLessThan(one.city)
  })

  test('ボーナスは年収に入る', () => {
    expect(residentTax(300_000, { ...STANDARD, bonusMonths: 4 }).salary).toBe(4_800_000)
  })
})

test('給与所得控除の境目がつながる', () => {
  expect(employmentDeduction(1_900_000)).toBe(650_000)
  expect(employmentDeduction(1_900_001)).toBe(650_000)
  expect(employmentDeduction(3_600_000)).toBe(1_160_000)
  expect(employmentDeduction(6_600_000)).toBe(1_760_000)
  expect(employmentDeduction(8_500_000)).toBe(1_950_000)
})
