import { expect, test } from 'bun:test'
import registry from '../../../packages/jurisdictions/jurisdictions.json'
import { DOMAIN_FRAMES, OTHER_FRAME } from '../jurisdiction/domains'
import { EMBLEMS } from '../jurisdiction/emblems'
import { missingGlyphs, ogSvg } from './og'

// OG 画像は字形をパスで描くので、字形の無い字は画像から抜ける。名前・分野を変えたら build:og で字形を作り直す
test('紋章のある自治体の名前と分野の名前は、OG 画像の字形が揃っている', () => {
  const names = Object.keys(EMBLEMS).map((code) => (registry.jurisdictions as Record<string, { name: string }>)[code]?.name ?? code)
  for (const name of [...names, '東京都', '兵庫県', ...DOMAIN_FRAMES.map((f) => f.name), OTHER_FRAME.name]) expect(missingGlyphs(name), name).toEqual([])
})

test('OG 画像のサンキーは大きい順に6分野へ名前を付け、残りを「ほか」にまとめる', () => {
  const areas = ['福祉・子育て', '行政・議会', '教育', '住まい・まちづくり', '産業・交通', '健康・医療', '環境', 'その他'].map((name, i) => ({ name, yen: (9 - i) * 1e10 }))
  const svg = ogSvg({ name: '品川区', prefecture: '東京都', year: 2024, total: 209_712_345_678, areas, emblemSvg: '<svg/>', logoSvg: '<svg/>' })
  expect(svg.startsWith('<svg')).toBe(true)
  // 名前のある分野は6つ＋「ほか」で、棒は総額の1本と分野の7本
  expect(svg.match(/<rect x="852"/g)?.length).toBe(7)
  expect(svg).not.toContain('NaN')
})
