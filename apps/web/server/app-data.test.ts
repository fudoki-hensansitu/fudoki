import { expect, test } from 'bun:test'
import { subjectTree } from './app-data'

const row = (id: string, level: '款' | '項' | '目', parent: string | null, yen: number, leaf: boolean, cofog: string | null, codes: [string, string | null, string | null]) => ({
  subject_id: id, parent_subject_id: parent, level, name: id, amount_yen: yen, is_leaf: leaf, cofog_code: cofog,
  kan_code: codes[0], kou_code: codes[1], moku_code: codes[2],
})

test('分野の合計は末端の科目（目と、目の無い項）の和で、総額と合う', () => {
  const { kan, fields } = subjectTree([
    row('款1', '款', null, 300, false, null, ['1', null, null]),
    row('項1', '項', '款1', 200, false, null, ['1', '1', null]),
    row('目1', '目', '項1', 120, true, '01.1', ['1', '1', '1']),
    row('目2', '目', '項1', 80, true, '10.1', ['1', '1', '2']),
    // 目の無い項
    row('項2', '項', '款1', 100, true, '10.2', ['1', '2', null]),
  ])
  const total = kan.reduce((s, k) => s + k.yen, 0)
  expect(Object.values(fields).reduce((s, v) => s + v, 0)).toBe(total)
  expect(Object.keys(fields).length).toBe(2)
})
