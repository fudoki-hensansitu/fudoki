// 一覧の地図（都道府県ごとの市区町村の境界）を SVG の path にして jurisdiction/map.generated.ts に書く。
//   bun run --cwd apps/web build:map
// 境界の正本は public/<都道府県>.geojson（map/build.py が国土数値情報から作る）。数百KB の GeoJSON を Worker と画面に載せないよう、
// 投影と丸めを済ませた path だけを commit する。島しょは本土と縮尺を揃えると点にしかならないので地図に描かず、一覧と表で扱う
import { readFileSync } from 'node:fs'

type Ring = [number, number][]
type Feature = { properties: { code: string; name: string; island: boolean }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } }

// 地図を持つ都道府県。足すときは map/build.py で境界を作ってからここに並べる
const PREFECTURES = [
  { code: '13', name: '東京都', file: 'tokyo' },
  { code: '28', name: '兵庫県', file: 'hyogo' },
] as const

// 幅 800・高さ 560 の枠に収める（兵庫県のような縦長の県も、横長の東京都と同じ枠で描く）
const WIDTH = 800
const HEIGHT = 560
const r = (v: number) => Math.round(v * 2) / 2
// 投影した後に、描く大きさで 0.8px より小さい凹凸を Douglas-Peucker で落とす（海岸線の細かい入り組みで path が膨らむのを止める）
const TOLERANCE = 0.8
function simplify(pts: [number, number][]): [number, number][] {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [i0, i1] = stack.pop()!
    const [ax, ay] = pts[i0]!
    const [bx, by] = pts[i1]!
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    let max = -1
    let idx = -1
    for (let i = i0 + 1; i < i1; i++) {
      const [px, py] = pts[i]!
      const dist = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (dist > max) [max, idx] = [dist, i]
    }
    if (max > TOLERANCE) {
      keep[idx] = 1
      stack.push([i0, idx], [idx, i1])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const rings = (f: Feature): Ring[] => (f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as Ring[][]).flat() : (f.geometry.coordinates as Ring[]))

function build(file: string) {
  const geo = JSON.parse(readFileSync(new URL(`../public/${file}.geojson`, import.meta.url), 'utf8')) as { features: Feature[] }
  const mainland = geo.features.filter((f) => !f.properties.island)
  const all = mainland.flatMap(rings).flat()
  const y0 = Math.min(...all.map(([, y]) => y))
  const y1 = Math.max(...all.map(([, y]) => y))
  // その都道府県の中央の緯度で経度を縮め、正距円筒の横伸びを直す
  const K = Math.cos((((y0 + y1) / 2) * Math.PI) / 180)
  const x0 = Math.min(...all.map(([x]) => x * K))
  const x1 = Math.max(...all.map(([x]) => x * K))
  const scale = Math.min(WIDTH / (x1 - x0), HEIGHT / (y1 - y0))
  const width = Math.ceil((x1 - x0) * scale)
  const height = Math.ceil((y1 - y0) * scale)
  const d = (rs: Ring[]) =>
    rs
      .map((ring) => {
        // 閉じたリングは先頭と末尾が同じ点なので、半分に分けて別々に単純化する
        const xy = ring.map(([lon, lat]) => [(lon * K - x0) * scale, (y1 - lat) * scale] as [number, number])
        const mid = Math.floor(xy.length / 2)
        const half = [...simplify(xy.slice(0, mid + 1)), ...simplify(xy.slice(mid)).slice(1)]
        const pts: string[] = []
        for (const [x, y] of half) {
          const p = `${r(x)},${r(y)}`
          if (pts.at(-1) !== p) pts.push(p)
        }
        return pts.length >= 3 ? `M${pts.join('L')}Z` : ''
      })
      .join('')
  return { width, height, shapes: mainland.map((f) => ({ code: f.properties.code, d: d(rings(f)) })) }
}

const maps = PREFECTURES.map((p) => ({ code: p.code, name: p.name, ...build(p.file) }))
const out = `// 生成物（jurisdiction/map-build.ts）。手で直さない
export const PREFECTURE_MAPS = ${JSON.stringify(maps)} as const
`
await Bun.write(new URL('./map.generated.ts', import.meta.url), out)
console.log(`jurisdiction/map.generated.ts ${Math.round(out.length / 1024)} KiB, ${maps.map((m) => `${m.name} ${m.shapes.length}`).join(', ')}`)
