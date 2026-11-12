import { expect, test } from 'bun:test'
import { ogChars, ogSvg } from './og'

test('OG 画像のサンキーは大きい順に6分野へ名前を付け、残りを「ほか」にまとめる', () => {
  const areas = ['福祉・子育て', '行政・議会', '教育', '住まい・まちづくり', '産業・交通', '健康・医療', '環境', 'その他'].map((name, i) => ({ name, yen: (9 - i) * 1e10 }))
  const svg = ogSvg({ name: '品川区', prefecture: '東京都', year: 2024, total: 209_712_345_678, areas, emblemSvg: '<svg/>', logoSvg: '<svg/>' })
  expect(svg.startsWith('<svg')).toBe(true)
  // 名前のある分野は6つ＋「ほか」で、棒は総額の1本と分野の7本
  expect(svg.match(/<rect x="852"/g)?.length).toBe(7)
  expect(svg).not.toContain('NaN')
})

test('OG 画像の書体は、SVG に書いた字だけを取る（data URI の中身や属性の字は入れない）', () => {
  const svg = ogSvg({ name: 'A&B町', prefecture: '東京都', year: 2024, total: 1e10, areas: [{ name: '教育', yen: 1e10 }], emblemSvg: '<svg><text>紋</text></svg>', logoSvg: '<svg/>' })
  const chars = ogChars(svg)
  for (const ch of 'A&B町東京都教育億円') expect(chars).toContain(ch)
  expect(chars).not.toContain('紋')
  expect(chars).not.toContain('<')
})

test('帰属表示の要る紋章は、描き起こした人とライセンスを OG 画像に書く', () => {
  const base = { name: 'つくば市', prefecture: '茨城県', year: 2024, total: 1e10, areas: [{ name: '教育', yen: 1e10 }], emblemSvg: '<svg/>', logoSvg: '<svg/>' }
  expect(ogChars(ogSvg({ ...base, credit: '紋章の SVG 化: Kilom691, Mike Rohsopht / CC BY-SA 3.0' }))).toContain('R')
  expect(ogSvg({ ...base, credit: '紋章の SVG 化: Kilom691 / CC BY-SA 3.0' })).toContain('紋章の SVG 化: Kilom691 / CC BY-SA 3.0')
  expect(ogSvg(base)).not.toContain('SVG 化')
})
