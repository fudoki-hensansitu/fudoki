import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { COFOG_DIVISION_LABELS, COFOG_DIVISIONS, COFOG_NAMES } from '@fudoki/fiscal/cofog-master'
import { DOMAIN_FRAMES, frameOf } from '../jurisdiction/domains'

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
  test('大分類の言い換えは正式名と同じコードを持ち、分野は大分類と一対一', () => {
    expect(Object.keys(COFOG_DIVISION_LABELS).sort()).toEqual(Object.keys(COFOG_DIVISIONS).sort())
    expect(DOMAIN_FRAMES.map((f) => f.cofog).sort()).toEqual(Object.keys(COFOG_DIVISIONS).sort())
  })
  test('dbt の COFOG マスタのコードは、画面の名前の表（cofog-master.ts）にも全部ある', () => {
    // CSV だけに足すと、画面の分野の図に「COFOG 09.4」とコードのまま出る
    const names = Object.assign({}, ...Object.values(COFOG_NAMES)) as Record<string, string>
    expect(masterCodes.filter((code) => !names[code!])).toEqual([])
  })
  test('枠の id は重ならない', () => {
    expect(new Set(DOMAIN_FRAMES.map((f) => f.id)).size).toBe(DOMAIN_FRAMES.length)
  })
})
