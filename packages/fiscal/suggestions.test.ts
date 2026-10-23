import { describe, expect, test } from 'bun:test'
import { readSuggestions, SUGGESTIONS_META_KEY } from './suggestions'

const ok = { label: '内訳を見る', prompt: '内訳を見せて' }

describe('readSuggestions', () => {
  test('形の合う候補だけを最大3つ読む', () => {
    const meta = { [SUGGESTIONS_META_KEY]: [ok, { label: 1, prompt: 'x' }, null, ok, ok, ok] }
    expect(readSuggestions(meta)).toEqual([ok, ok, ok])
  })
  test('長さの上限を超えるか空の候補は捨てる', () => {
    const meta = { [SUGGESTIONS_META_KEY]: [{ label: 'a'.repeat(41), prompt: 'x' }, { label: 'a', prompt: 'x'.repeat(201) }, { label: '', prompt: 'x' }, ok] }
    expect(readSuggestions(meta)).toEqual([ok])
  })
  test('キーが無い・配列でない _meta は空', () => {
    expect(readSuggestions(undefined)).toEqual([])
    expect(readSuggestions({ [SUGGESTIONS_META_KEY]: 'x' })).toEqual([])
  })
})
