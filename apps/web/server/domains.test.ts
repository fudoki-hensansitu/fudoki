import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { COFOG_DIVISION_LABELS, COFOG_DIVISIONS } from '@fudoki/fiscal/cofog-master'
import { DOMAIN_FRAMES, frameOf, groupByFrame } from '../jurisdiction/domains'
import { PROFILES } from '../jurisdiction/profiles'

// 分野の枠から事業が漏れると、ページから黙って消える
const masterCodes = readFileSync(new URL('../../../pipeline/dbt/seeds/fiscal/cofog_master.csv', import.meta.url), 'utf8')
  .split('\n').slice(1).map((l) => l.split(',')[0]?.replace(/"/g, '')).filter(Boolean)

describe('分野の枠', () => {
  test('COFOG の全コードがどれか一つの枠に入る', () => {
    for (const code of masterCodes) expect(frameOf(code!), code).toBeDefined()
  })
  test('分野は COFOG の大分類で決まる', () => {
    expect(frameOf('10.4')?.id).toBe('fukushi')
    expect(frameOf('09.1')?.id).toBe('kyoiku')
    expect(frameOf('04.5.1')?.id).toBe('sangyo')
    expect(frameOf('01')?.id).toBe('gyosei')
  })
  test('自治体ページの事業は全て COFOG のマスタにあるコードを持ち、枠から漏れない', () => {
    for (const profile of Object.values(PROFILES)) {
      for (const [year, y] of Object.entries(profile.years)) {
        for (const p of y.projects) expect(masterCodes, `${year} ${p.name}`).toContain(p.cofog)
        expect(groupByFrame(y.projects).flatMap((g) => g.items).length).toBe(y.projects.length)
        // 予算の資料の項目は、分類できない目（空）なら「その他」に入る
        for (const p of y.budgetNew ?? []) if (p.cofog) expect(masterCodes, `${year} ${p.name}`).toContain(p.cofog)
        expect(groupByFrame(y.budgetNew ?? []).flatMap((g) => g.items).length).toBe(y.budgetNew?.length ?? 0)
      }
    }
  })
  test('大分類の言い換えは正式名と同じコードを持ち、分野は大分類と一対一', () => {
    expect(Object.keys(COFOG_DIVISION_LABELS).sort()).toEqual(Object.keys(COFOG_DIVISIONS).sort())
    expect(DOMAIN_FRAMES.map((f) => f.cofog).sort()).toEqual(Object.keys(COFOG_DIVISIONS).sort())
  })
  test('枠の id は重ならない', () => {
    expect(new Set(DOMAIN_FRAMES.map((f) => f.id)).size).toBe(DOMAIN_FRAMES.length)
  })
})
