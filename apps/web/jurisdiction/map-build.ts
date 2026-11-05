// 一覧の地図（東京都の市区町村の境界）を SVG の path にして jurisdiction/map.generated.ts に書く。
//   bun run --cwd apps/web build:map
// 境界の正本は public/tokyo.geojson（map/build.py が国土数値情報から作る）。800KB の GeoJSON を Worker と画面に載せないよう、
// 投影と丸めを済ませた path だけを commit する。島しょは本土と縮尺を揃えると点にしかならないので地図に描かず、一覧と表で扱う
import { readFileSync } from 'node:fs'

type Ring = [number, number][]
type Feature = { properties: { code: string; name: string; island: boolean }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } }

const WIDTH = 800
const LAT = 35.7 // 東京の緯度で経度を縮め、正距円筒の横伸びを直す
const K = Math.cos((LAT * Math.PI) / 180)

const geo = JSON.parse(readFileSync(new URL('../public/tokyo.geojson', import.meta.url), 'utf8')) as { features: Feature[] }
const rings = (f: Feature): Ring[] => (f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as Ring[][]).flat() : (f.geometry.coordinates as Ring[]))
const mainland = geo.features.filter((f) => !f.properties.island)
const all = mainland.flatMap(rings).flat()
const x0 = Math.min(...all.map(([x]) => x * K))
const x1 = Math.max(...all.map(([x]) => x * K))
const y0 = Math.min(...all.map(([, y]) => y))
const y1 = Math.max(...all.map(([, y]) => y))
const scale = WIDTH / (x1 - x0)
const height = Math.ceil((y1 - y0) * scale)

const r = (v: number) => Math.round(v * 2) / 2
function d(rs: Ring[]): string {
  return rs
    .map((ring) => {
      const pts: string[] = []
      for (const [lon, lat] of ring) {
        const p = `${r((lon * K - x0) * scale)},${r((y1 - lat) * scale)}`
        if (pts.at(-1) !== p) pts.push(p)
      }
      return pts.length >= 3 ? `M${pts.join('L')}Z` : ''
    })
    .join('')
}

const shapes = mainland.map((f) => ({ code: f.properties.code, d: d(rings(f)) }))
const out = `// 生成物（jurisdiction/map-build.ts）。手で直さない
export const TOKYO_MAP = ${JSON.stringify({ width: WIDTH, height, shapes })} as const
`
await Bun.write(new URL('./map.generated.ts', import.meta.url), out)
console.log(`jurisdiction/map.generated.ts ${Math.round(out.length / 1024)} KiB, ${shapes.length} shapes`)
