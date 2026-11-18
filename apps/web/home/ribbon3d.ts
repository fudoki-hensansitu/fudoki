// 刷り直すときに押し出された前のレシートを、1本の続いた紙として描く（receipt.tsx の Ribbon が、初めて紙を刷った時点で先に読み込む）。
// 紙はキャタピラーのベルトのように回る。今のレシートの下端（attach）に続いて真下へ垂れ、新しいレシートの末端より少し下（turn）で
// 奥へ半円に折り返し、レシートの裏を少し横にずらして上へ戻り、差し出し口（canvas の上端）で見えなくなる。
// 紙の絵は DOM の紙を canvas に写したもの（snap.ts）。垂れている所は奥行き 0 の平らな面で、DOM の紙と同じ明るさ・同じ大きさに見える
import * as THREE from 'three'

/** 紙の裏の色（刷っていない面） */
const BACK = 0xf4f1ea
/** 折り返しの半径（px） */
export const TURN_R = 16
/** 戻る紙を、今のレシートから横へずらす幅（px） */
const SHIFT = 20
/** 縦に何 px ごとに板を区切るか（細かいほど折り返しがなめらか） */
const STEP = 6

/** 紙の通り道。attach から s だけ進んだ所（v: 画面の下, w: 手前）と横のずれ */
function path(attach: number, turn: number) {
  const drop = Math.max(0, turn - attach)
  const arc = Math.PI * TURN_R
  return (s: number) => {
    if (s <= drop) return { v: attach + s, w: 0, dx: 0 }
    if (s <= drop + arc) {
      const t = (s - drop) / TURN_R
      const r = t / Math.PI
      return { v: turn + Math.sin(t) * TURN_R, w: -(1 - Math.cos(t)) * TURN_R, dx: SHIFT * r * r * (3 - 2 * r) }
    }
    return { v: turn - (s - drop - arc), w: -2 * TURN_R, dx: SHIFT }
  }
}

export type Sheet = { key: string; texture: HTMLCanvasElement; height: number }

type Mesh = { geo: THREE.BufferGeometry; map: THREE.CanvasTexture; front: THREE.MeshLambertMaterial; back: THREE.MeshLambertMaterial; group: THREE.Group; rows: number }

/** 1本の紙を描く場。canvas は .rc-print の中に、紙の左右に余白（margin）を付けて置く。WebGL が使えなければ null */
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
  const meshes = new Map<string, Mesh>()
  let size = { w: 0, h: 0 }

  const sheet = (s: Sheet) => {
    let m = meshes.get(s.key)
    if (m) return m
    const rows = Math.max(2, Math.ceil(s.height / STEP))
    const geo = new THREE.BufferGeometry()
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
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((rows + 1) * 3 * 3), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(index)
    const map = new THREE.CanvasTexture(s.texture)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const front = new THREE.MeshLambertMaterial({ map, side: THREE.FrontSide })
    const back = new THREE.MeshLambertMaterial({ color: BACK, side: THREE.BackSide })
    const group = new THREE.Group()
    group.add(new THREE.Mesh(geo, front), new THREE.Mesh(geo, back))
    scene.add(group)
    m = { geo, map, front, back, group, rows }
    meshes.set(s.key, m)
    return m
  }

  const drop = (k: string) => {
    const m = meshes.get(k)
    if (!m) return
    scene.remove(m.group)
    m.geo.dispose()
    m.map.dispose()
    m.front.dispose()
    m.back.dispose()
    meshes.delete(k)
  }

  /** sheets（新しい順）を、attach から続く1本の紙として描く。turn は折り返す高さ、width は紙の幅（どちらも .rc-print の px） */
  const draw = (sheets: Sheet[], attach: number, turn: number, width: number, w: number, h: number) => {
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
    for (const k of [...meshes.keys()]) if (!keys.has(k)) drop(k)
    const at = path(attach, turn)
    let s0 = 0
    for (const s of sheets) {
      const m = sheet(s)
      const pos = m.geo.attributes.position as THREE.BufferAttribute
      for (let j = 0; j <= m.rows; j++) {
        const p = at(s0 + (j / m.rows) * s.height)
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
    for (const k of [...meshes.keys()]) drop(k)
    renderer.dispose()
  }
  return { draw, dispose }
}
