// 刷り直すときに押し出された前のレシートを、1本の続いた紙として描く（receipt.tsx の Ribbon が、初めて紙を刷った時点で先に読み込む）。
// 紙は差し出し口から出ている今のレシートの下端（attach）に続いて真下へ垂れ、床まで届いた分は床で前後に折り重なって積もる。
// 紙の絵は DOM の紙を canvas に写したもの（snap.ts）。垂れている所は奥行き 0 の平らな面で、DOM の紙と同じ明るさ・同じ大きさに見える。
// 床は前へ傾けて見せる（真正面から平行に写すと、床に寝た紙は線になってしまうため）。積もる順は紙の先（いちばん古い端）が下で、新しく押し出された紙が上に重なる
import * as THREE from 'three'

/** 紙の裏の色（刷っていない面） */
const BACK = 0xf4f1ea
/** 床に寝た紙の一折りの長さ（px）と、折り返しの半径（積み重なる厚みはその倍） */
const FOLD = 180
const BEND = 7
/** 床を前へ傾けて見せる角度。一折りは画面で FOLD × sin だけの高さに見える */
const TILT = (32 * Math.PI) / 180
/** 垂れた紙が床の手前で曲がり始める高さ */
const KNEE = 56
/** 縦に何 px ごとに板を区切るか（細かいほど曲がりがなめらか） */
const STEP = 6

const D = new THREE.Vector2(Math.sin(TILT), Math.cos(TILT)) // 床の上で前へ向かう向き（v: 画面の下, w: 手前）
const N = new THREE.Vector2(-Math.cos(TILT), Math.sin(TILT)) // 床から上へ積もる向き
const LAYER = FOLD + Math.PI * BEND

/** 折りの段ごとの小さな揺らぎ（横のずれ・長さ）。同じ段はいつも同じ値 */
const jitter = (k: number, salt: number) => {
  const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** 床に積もった紙の、紙の先からの長さ q の所（v, w）と横のずれ。q が大きいほど上の段 */
function pileAt(q: number, floor: number): { v: number; w: number; dx: number } {
  const k = Math.max(0, Math.floor(q / LAYER))
  const t = q - k * LAYER
  const h = k * 2 * BEND
  const forward = k % 2 === 0
  const dxK = jitter(k, 1) * 14
  const dxN = jitter(k + 1, 1) * 14
  const o = (u: number, hh: number) => ({ v: floor + u * D.x + hh * N.x, w: u * D.y + hh * N.y })
  if (t < FOLD) {
    const p = o(forward ? t : FOLD - t, h)
    return { ...p, dx: dxK }
  }
  // 段の端で折り返して、一段上へ
  const th = -Math.PI / 2 + ((t - FOLD) / (Math.PI * BEND)) * Math.PI
  const c = o(forward ? FOLD : 0, h + BEND)
  const along = (forward ? 1 : -1) * Math.cos(th) * BEND
  return { v: c.v + along * D.x + Math.sin(th) * BEND * N.x, w: c.w + along * D.y + Math.sin(th) * BEND * N.y, dx: dxK + (dxN - dxK) * ((th + Math.PI / 2) / Math.PI) }
}

/** 床に積もった分の、いちばん上の段の端での紙の向き（上の段へ進む向き） */
function pileTangent(q: number, floor: number) {
  const a = pileAt(Math.max(0, q - 2), floor)
  const b = pileAt(q, floor)
  const l = Math.hypot(b.v - a.v, b.w - a.w) || 1
  return { v: (b.v - a.v) / l, w: (b.w - a.w) / l }
}

type Bez = { p: { v: number; w: number }[]; len: number; table: number[] }
/** 垂れた紙が床の積もりにつながる曲がり（3次ベジエ）と、長さから位置を引く表 */
function bezier(p0: { v: number; w: number }, p1: { v: number; w: number }, p2: { v: number; w: number }, p3: { v: number; w: number }): Bez {
  const p = [p0, p1, p2, p3]
  const table = [0]
  let prev = p0
  let len = 0
  for (let i = 1; i <= 32; i++) {
    const q = bezPoint(p, i / 32)
    len += Math.hypot(q.v - prev.v, q.w - prev.w)
    table.push(len)
    prev = q
  }
  return { p, len, table }
}
function bezPoint(p: { v: number; w: number }[], t: number) {
  const m = 1 - t
  const a = m * m * m
  const b = 3 * m * m * t
  const c = 3 * m * t * t
  const d = t * t * t
  return { v: a * p[0]!.v + b * p[1]!.v + c * p[2]!.v + d * p[3]!.v, w: a * p[0]!.w + b * p[1]!.w + c * p[2]!.w + d * p[3]!.w }
}
function bezAt(z: Bez, s: number) {
  const i = Math.max(1, z.table.findIndex((x) => x >= s))
  const s0 = z.table[i - 1]!
  const s1 = z.table[i] ?? z.len
  const t = (i - 1 + (s1 > s0 ? (s - s0) / (s1 - s0) : 0)) / 32
  return bezPoint(z.p, Math.min(1, t))
}

/** 紙の通り道。attach から s だけ進んだ所（v: 画面の下, w: 手前）と横のずれ。L は紙の全長 */
function path(attach: number, floor: number, L: number) {
  // 床まで届かなければ、真下へ垂れるだけ
  if (L <= floor - attach) return (s: number) => ({ v: attach + s, w: 0, dx: 0 })
  // 床に積もる長さ P と、垂れて曲がる長さ d（= L - P）を決める。積もりの上端が変われば曲がりも変わるので2回詰める
  let P = L - (floor - attach)
  let curve: Bez | null = null
  let drop = 0
  let top = pileAt(P, floor)
  for (let i = 0; i < 3; i++) {
    top = pileAt(P, floor)
    const tan = pileTangent(P, floor)
    const knee = { v: Math.max(attach, Math.min(top.v, floor) - KNEE), w: 0 }
    drop = knee.v - attach
    // 積もりの上端から、上の段へ進む向きのまま持ち上がり、真上へ向いて垂れた紙につながる
    curve = bezier(top, { v: top.v + tan.v * 24, w: top.w + tan.w * 24 }, { v: knee.v + 24, w: 0 }, knee)
    P = Math.max(0, L - drop - curve.len)
  }
  const z = curve!
  const dxTop = top.dx
  return (s: number) => {
    if (s <= drop) return { v: attach + s, w: 0, dx: 0 }
    if (s <= drop + z.len) {
      const r = (s - drop) / z.len
      const p = bezAt(z, z.len - (s - drop))
      return { ...p, dx: dxTop * r * r }
    }
    return pileAt(L - s, floor)
  }
}

export type Sheet = { key: string; texture: HTMLCanvasElement; height: number }

/** 1本の紙を描く場。canvas は .rc-print の中に、紙の左右に余白（MARGIN）を付けて置く。WebGL が使えなければ null */
export function ribbon(canvas: HTMLCanvasElement, margin: number) {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  // 平らに垂れた所は DOM の紙と同じ明るさ（環境光と正面の光で 1 になる）。折り返しで光に背を向けた所だけ暗くなる
  scene.add(new THREE.AmbientLight(0xffffff, 0.47 * Math.PI))
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI)
  sun.position.set(0, 0.25, 1)
  scene.add(sun)
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000)
  const meshes = new Map<string, { geo: THREE.BufferGeometry; map: THREE.CanvasTexture; front: THREE.MeshLambertMaterial; back: THREE.MeshLambertMaterial; group: THREE.Group }>()
  let size = { w: 0, h: 0 }

  const sheet = (s: Sheet, width: number) => {
    let m = meshes.get(s.key)
    if (m) return m
    const rows = Math.max(2, Math.ceil(s.height / STEP))
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array((rows + 1) * 3 * 3)
    const uv = new Float32Array((rows + 1) * 3 * 2)
    const index: number[] = []
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i < 3; i++) {
        uv[(j * 3 + i) * 2] = i / 2
        uv[(j * 3 + i) * 2 + 1] = 1 - j / rows
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < 2; i++) {
        const a = j * 3 + i
        const b = a + 3
        index.push(a, b, a + 1, a + 1, b, b + 1)
      }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(index)
    const map = new THREE.CanvasTexture(s.texture)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const front = new THREE.MeshLambertMaterial({ map, side: THREE.FrontSide })
    const back = new THREE.MeshLambertMaterial({ color: BACK, side: THREE.BackSide })
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geo, front), new THREE.Mesh(geo, back))
    group.userData = { rows, width }
    scene.add(group)
    m = { geo, map, front, back, group }
    meshes.set(s.key, m)
    return m
  }

  /** sheets（新しい順）を、attach から続く1本の紙として描く。width は紙の幅、floor は床の高さ（どちらも .rc-print の px） */
  const draw = (sheets: Sheet[], attach: number, floor: number, width: number, w: number, h: number) => {
    if (w !== size.w || h !== size.h) {
      size = { w, h }
      renderer.setSize(w, h, false)
      camera.left = 0
      camera.right = w
      camera.top = 0
      camera.bottom = -h
      camera.updateProjectionMatrix()
    }
    const keys = new Set(sheets.map((s) => s.key))
    for (const [k, m] of meshes)
      if (!keys.has(k)) {
        scene.remove(m.group)
        m.geo.dispose()
        m.map.dispose()
        m.front.dispose()
        m.back.dispose()
        meshes.delete(k)
      }
    const L = sheets.reduce((n, s) => n + s.height, 0)
    const at = path(attach, floor, L)
    let s0 = 0
    for (const s of sheets) {
      const m = sheet(s, width)
      const rows = m.group.userData.rows as number
      const pos = m.geo.attributes.position as THREE.BufferAttribute
      for (let j = 0; j <= rows; j++) {
        const p = at(s0 + (j / rows) * s.height)
        for (let i = 0; i < 3; i++) pos.setXYZ(j * 3 + i, margin + p.dx + (i / 2) * width, -p.v, p.w)
      }
      pos.needsUpdate = true
      m.geo.computeVertexNormals()
      m.geo.computeBoundingSphere()
      s0 += s.height
    }
    renderer.render(scene, camera)
  }

  const dispose = () => {
    for (const m of meshes.values()) {
      m.geo.dispose()
      m.map.dispose()
      m.front.dispose()
      m.back.dispose()
    }
    meshes.clear()
    renderer.dispose()
  }
  return { draw, dispose }
}

/** 床に積もった紙が画面で占める高さの見積もり（床より上に積もる分と、手前へ傾けた一折りの分） */
export function pileExtent(length: number) {
  const layers = Math.max(0, Math.ceil(length / LAYER))
  return { above: layers * 2 * BEND * Math.cos(TILT) + KNEE, below: FOLD * Math.sin(TILT) + 2 * BEND }
}
