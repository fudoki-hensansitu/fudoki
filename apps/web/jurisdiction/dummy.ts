// データがまだ無い項目（人口・将来推計・特色）の仮の値。自治体のコードから決まる値で、画面には必ず「仮」を付ける。検索エンジンに渡す HTML には入れない
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)

export interface DummyPopulation {
  /** 万人 */
  now: number
  actual: { year: number; value: number }[]
  forecast: { year: number; mid: number; hi: number; lo: number }[]
}

export function dummyPopulation(code: string): DummyPopulation {
  const base = 8 + (hash(code) % 520) / 10
  const wave = [0, 0.004, 0.012, 0.018, 0.021, 0.018, 0.01, 0.014, 0.024, 0.03]
  const actual = wave.map((w, i) => ({ year: 2016 + i, value: round(base * (0.97 + w)) }))
  const now = actual.at(-1)!.value
  const drift = [0, 0.004, 0, -0.018, -0.045, -0.08]
  const forecast = drift.map((d, i) => ({ year: 2025 + i * 5, mid: round(now * (1 + d)), hi: round(now * (1 + d + i * 0.012)), lo: round(now * (1 + d - i * 0.014)) }))
  return { now, actual, forecast }
}

const round = (n: number) => Math.round(n * 10) / 10

export const DUMMY_TRAITS = ['住宅都市', '駅前の商店街', '大学・研究機関', '単身世帯が多い']
