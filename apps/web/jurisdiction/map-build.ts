// 一覧の地図（都道府県ごとの市区町村の境界）を SVG の path にして jurisdiction/map.generated.ts に書く。
//   bun run --cwd apps/web build:map
// 境界の正本は public/<都道府県>.geojson（map/build.py が国土数値情報から作る）。数百KB の GeoJSON を Worker と画面に載せないよう、
// 投影と丸めを済ませた path だけを commit する。島しょは本土と縮尺を揃えると点にしかならないので、本土の地図とは別の挿入図に描く
import { readFileSync } from 'node:fs'

type Ring = [number, number][]
type Feature = { properties: { code: string; name: string; island: boolean }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } }

// 地図を持つ都道府県。足すときは map/build.py で境界を作ってからここに並べる
// insets は島しょの挿入図。clip は経度・緯度の範囲で、その外の島（小笠原村の聟島列島・沖ノ鳥島・南鳥島など）は描かず、人の住む父島・母島の列島に寄せる
type Inset = { name: string; codes: string[]; clip?: [number, number, number, number] }
const PREFECTURES: { code: string; name: string; file: string; insets?: Inset[] }[] = [
  {
    code: '13',
    name: '東京都',
    file: 'tokyo',
    insets: [
      { name: '伊豆諸島', codes: ['133612', '133621', '133639', '133647', '133817', '133825', '134015', '134023'] },
      { name: '小笠原諸島', codes: ['134210'], clip: [142.0, 142.35, 26.5, 27.2] },
    ],
  },
  { code: '28', name: '兵庫県', file: 'hyogo' },
]

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

const area = (ring: Ring) => Math.abs(ring.reduce((a, [x, y], i) => { const [nx, ny] = ring[(i + 1) % ring.length]!; return a + x * ny - nx * y }, 0)) / 2
const inClip = (ring: Ring, c?: [number, number, number, number]) => !c || ring.every(([x, y]) => x >= c[0] && x <= c[1] && y >= c[2] && y <= c[3])

type Shape = { code: string; rings: Ring[] }

/** 境界を幅 w・高さ h の枠に投影する。minSize を与えると、それより小さく描かれる自治体をその重心を中心に拡大する（島を指で選べる大きさにする） */
function project(shapes: Shape[], w: number, h: number, minSize = 0) {
  const all = shapes.flatMap((s) => s.rings).flat()
  const y0 = Math.min(...all.map(([, y]) => y))
  const y1 = Math.max(...all.map(([, y]) => y))
  // その都道府県の中央の緯度で経度を縮め、正距円筒の横伸びを直す
  const K = Math.cos((((y0 + y1) / 2) * Math.PI) / 180)
  const x0 = Math.min(...all.map(([x]) => x * K))
  const x1 = Math.max(...all.map(([x]) => x * K))
  const scale = Math.min(w / (x1 - x0), h / (y1 - y0))
  const width = Math.ceil((x1 - x0) * scale)
  const height = Math.ceil((y1 - y0) * scale)
  // 拡大した島が枠からはみ出さないよう、拡大するときは周りに余白を取る
  const pad = minSize / 2
  const toXY = ([lon, lat]: [number, number]) => [(lon * K - x0) * scale + pad, (y1 - lat) * scale + pad] as [number, number]
  const d = (rs: Ring[]) => {
    const xyRings = rs.map((ring) => ring.map(toXY))
    if (minSize) {
      const pts = xyRings.flat()
      const [ax, bx] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))]
      const [ay, by] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))]
      const k = Math.max(1, minSize / Math.max(bx - ax, by - ay, 0.01))
      const [cx, cy] = [(ax + bx) / 2, (ay + by) / 2]
      for (const ring of xyRings) for (const p of ring) [p[0], p[1]] = [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]
    }
    return xyRings
      .map((xy) => {
        // 閉じたリングは先頭と末尾が同じ点なので、半分に分けて別々に単純化する
        const mid = Math.floor(xy.length / 2)
        const half = [...simplify(xy.slice(0, mid + 1)), ...simplify(xy.slice(mid)).slice(1)]
        const out: string[] = []
        for (const [x, y] of half) {
          const p = `${r(x)},${r(y)}`
          if (out.at(-1) !== p) out.push(p)
        }
        return out.length >= 3 ? `M${out.join('L')}Z` : ''
      })
      .join('')
  }
  return { width: width + 2 * pad, height: height + 2 * pad, shapes: shapes.map((s) => ({ code: s.code, d: d(s.rings) })) }
}

// 挿入図の枠と、島を描く最小の大きさ（px）
const INSET_WIDTH = 240
const INSET_HEIGHT = 300
const MIN_ISLAND = 26

function build(file: string, insets: Inset[] = []) {
  const geo = JSON.parse(readFileSync(new URL(`../public/${file}.geojson`, import.meta.url), 'utf8')) as { features: Feature[] }
  const mainland = geo.features.filter((f) => !f.properties.island).map((f) => ({ code: f.properties.code, rings: rings(f) }))
  const byCode = new Map(geo.features.map((f) => [f.properties.code, f]))
  return {
    ...project(mainland, WIDTH, HEIGHT),
    insets: insets.map((inset) => {
      const shapes = inset.codes.map((code) => {
        const f = byCode.get(code)
        if (!f) throw new Error(`${inset.name}: ${code} の境界が無い`)
        // 岩礁のような小さなリングは、自治体の範囲を広げて島が潰れるので、いちばん大きな島の 2% 未満は落とす
        const rs = rings(f).filter((ring) => inClip(ring, inset.clip))
        const max = Math.max(...rs.map(area))
        return { code, rings: rs.filter((ring) => area(ring) >= max * 0.02) }
      })
      return { name: inset.name, ...project(shapes, INSET_WIDTH, INSET_HEIGHT, MIN_ISLAND) }
    }),
  }
}

const maps = PREFECTURES.map((p) => ({ code: p.code, name: p.name, ...build(p.file, p.insets) }))
const out = `// 生成物（jurisdiction/map-build.ts）。手で直さない
export const PREFECTURE_MAPS = ${JSON.stringify(maps)} as const
`
await Bun.write(new URL('./map.generated.ts', import.meta.url), out)
console.log(`jurisdiction/map.generated.ts ${Math.round(out.length / 1024)} KiB, ${maps.map((m) => `${m.name} ${m.shapes.length}+${m.insets.map((i) => i.shapes.length).join('+')}`).join(', ')}`)
