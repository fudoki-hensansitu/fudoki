import { describe, expect, test } from 'bun:test'
import { subjectTree } from './app-data'

const row = (level: '款' | '項' | '目', id: string, parent: string | null, codes: [string, string | null, string | null], amount: number) => ({
  subject_id: id, parent_subject_id: parent, level, name: id, amount_yen: amount, is_leaf: level === '目',
  kan_code: codes[0], kou_code: codes[1], moku_code: codes[2], cofog_code: null,
})

describe('款・項・目の木', () => {
  test('款が10を超え、款・項の行の下位の番号が無くても、全ての目が親の項に入る', () => {
    // API は順不同で返す。番号を文字で比べると 10 が 2 より前に、款の行（項・目の番号が null）が子の後ろに来る
    const rows = [
      row('目', 'm10', 'k10-1', ['10', '1', '1'], 5),
      row('款', 'k2', null, ['2', null, null], 7),
      row('目', 'm2-a', 'k2-1', ['2', '1', '2'], 3),
      row('項', 'k10-1', 'k10', ['10', '1', null], 5),
      row('目', 'm2-b', 'k2-1', ['2', '1', '1'], 4),
      row('目', 'haimoku', 'k2-1', ['2', '1', null], 0),
      row('款', 'k10', null, ['10', null, null], 5),
      row('項', 'k2-1', 'k2', ['2', '1', null], 7),
    ]
    const { kan, looseMoku } = subjectTree(rows)
    expect(looseMoku).toEqual([])
    expect(kan.map((k) => [k.name, k.kou.map((o) => [o.name, o.moku.map((m) => m.name)])])).toEqual([
      ['k2', [['k2-1', ['m2-b', 'm2-a', 'haimoku']]]],
      ['k10', [['k10-1', ['m10']]]],
    ])
  })
})
