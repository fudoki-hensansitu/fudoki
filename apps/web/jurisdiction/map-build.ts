// 一覧の都道府県の図（市区町村を同じ大きさのタイルで、おおよその位置に並べる）を jurisdiction/map.generated.ts に書く。
//   bun run --cwd apps/web build:map
// 位置の正本は map/<都道府県>.geojson（map/build.py が国土数値情報から作る）の境界。形は描かず、各自治体の重心から
// タイルの列・行だけを決めて commit する。面積の差で小さな区が潰れず、名前を書けるので、日本のタイル地図と同じ見せ方になる。
// 島しょは本土と並べると位置が離れすぎるので、本土のタイルとは別の段に北から並べる
import { readFileSync } from 'node:fs'

type Ring = [number, number][]
type Feature = { properties: { code: string; name: string; island: boolean }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } }

// 図を持つ都道府県。足すときは map/build.py で境界を作ってからここに並べる
const PREFECTURES: { code: string; name: string; file: string }[] = [
  { code: '13', name: '東京都', file: 'tokyo' },
  { code: '28', name: '兵庫県', file: 'hyogo' },
]

// タイルの数に対するマスの余裕。1 だと詰まりすぎて位置がずれ、大きいと隙間だらけになる
const SLACK = 1.35
// 重心の座標と、その順位（0〜1）を混ぜる割合。順位を混ぜると、23区のような密集が広がって隣どうしの関係が保たれる
const RANK = 0.6

const rings = (f: Feature): Ring[] => (f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as Ring[][]).flat() : (f.geometry.coordinates as Ring[]))
const signedArea = (ring: Ring) => ring.reduce((a, [x, y], i) => { const [nx, ny] = ring[(i + 1) % ring.length]!; return a + x * ny - nx * y }, 0) / 2

/** いちばん大きなリング（本体の島・陸地）の重心。飛び地や小島に引っぱられないようにする */
function centroid(f: Feature): [number, number] {
  const ring = rings(f).reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a))
  const A = signedArea(ring)
  let cx = 0
  let cy = 0
  ring.forEach(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]!
    const c = x * ny - nx * y
    cx += (x + nx) * c
    cy += (y + ny) * c
  })
  return [cx / (6 * A), cy / (6 * A)]
}

type Tile = { code: string; name: string; col: number; row: number }

/** 重心を格子のマスに割り当てる。全ての（自治体, マス）の組を距離の近い順に見て、どちらも空いていれば決める */
function grid(items: { code: string; name: string; lon: number; lat: number }[]): { cols: number; rows: number; tiles: Tile[] } {
  const n = items.length
  const K = Math.cos(((items.reduce((a, i) => a + i.lat, 0) / n) * Math.PI) / 180)
  const xs = items.map((i) => i.lon * K)
  const ys = items.map((i) => -i.lat)
  const norm = (v: number[]) => {
    const [lo, hi] = [Math.min(...v), Math.max(...v)]
    const order = [...v].sort((a, b) => a - b)
    return v.map((x) => (1 - RANK) * ((x - lo) / (hi - lo || 1)) + RANK * (order.indexOf(x) / (n - 1 || 1)))
  }
  const aspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys) || 1)
  const cols = Math.max(1, Math.round(Math.sqrt(n * SLACK * aspect)))
  const rows = Math.max(1, Math.ceil((n * SLACK) / cols))
  const nx = norm(xs).map((x) => x * (cols - 1))
  const ny = norm(ys).map((y) => y * (rows - 1))
  const pairs: [number, number, number][] = []
  for (let i = 0; i < n; i++) for (let c = 0; c < cols * rows; c++) pairs.push([Math.hypot(nx[i]! - (c % cols), ny[i]! - Math.floor(c / cols)), i, c])
  pairs.sort((a, b) => a[0] - b[0])
  const cellOf = new Map<number, number>()
  const used = new Set<number>()
  for (const [, i, c] of pairs) {
    if (cellOf.has(i) || used.has(c)) continue
    cellOf.set(i, c)
    used.add(c)
    if (cellOf.size === n) break
  }
  // 貪欲に決めた割り当てを、2つのマスの入れ替え（空きマスへの移動を含む）で距離の二乗和が減らなくなるまで直す
  const owner = new Map<number, number>([...cellOf].map(([i, c]) => [c, i]))
  const cost = (i: number | undefined, c: number) => (i === undefined ? 0 : (nx[i]! - (c % cols)) ** 2 + (ny[i]! - Math.floor(c / cols)) ** 2)
  for (let improved = true; improved; ) {
    improved = false
    for (let a = 0; a < cols * rows; a++)
      for (let b = a + 1; b < cols * rows; b++) {
        const [ia, ib] = [owner.get(a), owner.get(b)]
        if (ia === undefined && ib === undefined) continue
        if (cost(ia, b) + cost(ib, a) < cost(ia, a) + cost(ib, b) - 1e-9) {
          for (const [i, c] of [[ia, b], [ib, a]] as const) {
            if (i === undefined) owner.delete(c)
            else (owner.set(c, i), cellOf.set(i, c))
          }
          improved = true
        }
      }
  }
  // 空いた行・列を詰める
  const usedCols = [...new Set([...cellOf.values()].map((c) => c % cols))].sort((a, b) => a - b)
  const usedRows = [...new Set([...cellOf.values()].map((c) => Math.floor(c / cols)))].sort((a, b) => a - b)
  const tiles = items.map((it, i) => {
    const c = cellOf.get(i)!
    return { code: it.code, name: it.name, col: usedCols.indexOf(c % cols), row: usedRows.indexOf(Math.floor(c / cols)) }
  })
  return { cols: usedCols.length, rows: usedRows.length, tiles }
}

function build(file: string) {
  const geo = JSON.parse(readFileSync(new URL(`../map/${file}.geojson`, import.meta.url), 'utf8')) as { features: Feature[] }
  const items = geo.features.map((f) => {
    const [lon, lat] = centroid(f)
    return { code: f.properties.code, name: f.properties.name, island: f.properties.island, lon, lat }
  })
  return {
    ...grid(items.filter((i) => !i.island)),
    islands: items
      .filter((i) => i.island)
      .sort((a, b) => b.lat - a.lat)
      .map((i) => ({ code: i.code, name: i.name })),
  }
}

const maps = PREFECTURES.map((p) => ({ code: p.code, name: p.name, ...build(p.file) }))
const out = `// 生成物（jurisdiction/map-build.ts）。手で直さない
export const PREFECTURE_MAPS = ${JSON.stringify(maps)} as const
`
await Bun.write(new URL('./map.generated.ts', import.meta.url), out)
console.log(`jurisdiction/map.generated.ts ${Math.round(out.length / 1024)} KiB, ${maps.map((m) => `${m.name} ${m.cols}×${m.rows} ${m.tiles.length}+${m.islands.length}`).join(', ')}`)
