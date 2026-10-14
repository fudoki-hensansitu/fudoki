import { describe, expect, test } from 'bun:test'
import { barWidths } from '../ui/types'

describe('棒の長さ', () => {
  test('割合を出す一覧では合計に対する比にし、最大の行でも 100% にならない', () => {
    expect(barWidths([60, 40], true)).toEqual([60, 40])
  })
  test('割合を出さない一覧では最大の行を 100% にする', () => {
    expect(barWidths([60, 40], false)).toEqual([100, (40 / 60) * 100])
  })
  test('金額の無い行と 0 以下の行は長さ 0 で、合計にも入れない', () => {
    expect(barWidths([null, 0, -5, 50, 50], true)).toEqual([0, 0, 0, 50, 50])
  })
})
