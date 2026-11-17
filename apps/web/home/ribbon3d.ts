// 刷り直すときに押し出された前のレシートを、1本の続いた紙として描く（receipt.tsx の Ribbon が、初めて紙を刷った時点で先に読み込む）。
// 紙は粒を鎖につないだもので、上端を今のレシートの下端（attach）に留め、重さで垂らして床に当てる。床に着いた紙は押し込まれて自然に折れ、折り重なって積もる。
// 物理は縦（高さ y）と奥行き（手前へ z）の面だけで解く（紙は幅があるのでねじれない）。紙は差し出し口の面（z = 0）より奥へは行けない。
// 紙の絵は DOM の紙を canvas に写したもの（snap.ts）。垂れている所は奥行き 0 の平らな面で、DOM の紙と同じ明るさ・同じ大きさに見える。
// 床は前へ傾けて見せる（手前へ z 進むと画面では z × sin だけ下に見える。真正面から平行に写すと、床に寝た紙は線になってしまうため）
import * as THREE from 'three'

/** 紙の裏の色（刷っていない面） */
const BACK = 0xf4f1ea
/** 床を前へ傾けて見せる角度 */
const TILT = (32 * Math.PI) / 180
const SIN = Math.sin(TILT)
const COS = Math.cos(TILT)
/** 粒の間隔（px）。細かいほど曲がりがなめらか */
const STEP = 6
/** 紙どうしが近づける距離（重なった紙の厚み）。粒の間隔の半分より大きくして、紙が紙をすり抜けないようにする */
const THICK = 6
/** 重さ（px/s²）と、空気の抵抗（1 刻みごとに残る速さの割合） */
const GRAVITY = 2600
const DRAG = 0.992
/** 紙のこし（曲がりを戻す強さ、0〜1） */
const STIFF = 0.5
/** 床の摩擦（床に触れた粒の、横に滑る速さの残る割合） */
const FRICTION = 0.25
/** 1 frame を何刻みに分けて解くか、1 刻みで鎖の長さを何回詰めるか */
const SUB = 4
const ITER = 10

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
  // 平らに垂れた所は DOM の紙と同じ明るさ（環境光と正面の光で 1 になる）。床に寝た所・折り返しで光に背を向けた所だけ暗くなる
  scene.add(new THREE.AmbientLight(0xffffff, 0.47 * Math.PI))
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI)
  sun.position.set(0, 0.25, 1)
  scene.add(sun)
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000)
  const meshes = new Map<string, Mesh>()
  let size = { w: 0, h: 0 }

  // 鎖。粒 0 が上端（attach に留める）。y は床からの高さ、z は差し出し口の面から手前への距離
  let y = new Float64Array(0)
  let z = new Float64Array(0)
  let py = new Float64Array(0)
  let pz = new Float64Array(0)
  /** 粒 i と i + 1 の間の長さ */
  let rest = new Float64Array(0)
  /** 紙ごとの、最初の粒の番号（隣の紙とは境の粒を共有する） */
  let starts = new Map<string, number>()
  let order = ''
  let lastFloor = 0
  let still = 0
  let lastTime = 0

  const mesh = (s: Sheet, rows: number) => {
    let m = meshes.get(s.key)
    if (m) return m
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
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((rows + 1) * 3 * 3), 3))
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

  const drop = (k: string, m: Mesh) => {
    scene.remove(m.group)
    m.geo.dispose()
    m.map.dispose()
    m.front.dispose()
    m.back.dispose()
    meshes.delete(k)
  }

  /** 紙の並びが変わったら鎖を組み直す。前からある紙の粒はその場に残し、新しく押し出された紙は上端から真下へ伸ばして置く */
  const rebuild = (sheets: Sheet[], top: number) => {
    const rowsOf = (s: Sheet) => Math.max(2, Math.ceil(s.height / STEP))
    const n = sheets.reduce((a, s) => a + rowsOf(s), 0) + 1
    const ny = new Float64Array(n)
    const nz = new Float64Array(n)
    const npy = new Float64Array(n)
    const npz = new Float64Array(n)
    const nrest = new Float64Array(n - 1)
    const nstarts = new Map<string, number>()
    let at = 0
    for (const s of sheets) {
      const rows = rowsOf(s)
      nstarts.set(s.key, at)
      for (let j = 0; j < rows; j++) nrest[at + j] = s.height / rows
      const was = starts.get(s.key)
      for (let j = at === 0 ? 0 : 1; j <= rows; j++) {
        const i = at + j
        if (was !== undefined) {
          ny[i] = y[was + j]!
          nz[i] = z[was + j]!
          npy[i] = py[was + j]!
          npz[i] = pz[was + j]!
        } else {
          // 真下へ伸ばす。少しだけ手前へずらしておき、床に着いたとき手前へ折れるきっかけにする
          ny[i] = i === 0 ? top : ny[i - 1]! - nrest[i - 1]!
          nz[i] = Math.random() * 0.05
          npy[i] = ny[i]!
          npz[i] = nz[i]!
        }
      }
      at += rows
    }
    y = ny
    z = nz
    py = npy
    pz = npz
    rest = nrest
    starts = nstarts
  }

  const step = (dt: number, top: number) => {
    const n = y.length
    const g = GRAVITY * dt * dt
    for (let i = 1; i < n; i++) {
      const vy = (y[i]! - py[i]!) * DRAG
      const vz = (z[i]! - pz[i]!) * DRAG
      py[i] = y[i]!
      pz[i] = z[i]!
      y[i] = y[i]! + vy - g
      z[i] = z[i]! + vz
    }
    py[0] = y[0]!
    pz[0] = z[0]!
    y[0] = top
    z[0] = 0
    for (let it = 0; it < ITER; it++) {
      // 鎖の長さ（紙は伸び縮みしない）
      for (let i = 0; i < n - 1; i++) {
        const dy = y[i + 1]! - y[i]!
        const dz = z[i + 1]! - z[i]!
        const d = Math.hypot(dy, dz) || 1e-6
        const k = (d - rest[i]!) / d
        if (i === 0) {
          y[1] = y[1]! - dy * k
          z[1] = z[1]! - dz * k
        } else {
          y[i] = y[i]! + dy * k * 0.5
          z[i] = z[i]! + dz * k * 0.5
          y[i + 1] = y[i + 1]! - dy * k * 0.5
          z[i + 1] = z[i + 1]! - dz * k * 0.5
        }
      }
      // こし: 一つ飛ばしの粒どうしが近づく（紙が曲がる）のを、まっすぐな長さへ少し戻す。伸ばす向きには引かない
      for (let i = 0; i < n - 2; i++) {
        const dy = y[i + 2]! - y[i]!
        const dz = z[i + 2]! - z[i]!
        const d = Math.hypot(dy, dz) || 1e-6
        const r = rest[i]! + rest[i + 1]!
        if (d >= r) continue
        const k = ((d - r) / d) * STIFF * 0.5
        if (i > 0) {
          y[i] = y[i]! + dy * k
          z[i] = z[i]! + dz * k
        }
        y[i + 2] = y[i + 2]! - dy * k
        z[i + 2] = z[i + 2]! - dz * k
      }
      // 紙が紙をすり抜けないよう、毎回押し離す
      collide()
    }
    // 紙は伸びない。上端から順に、伸びた所だけを紙の長さへ引き戻す（反復で詰めるだけだと、長い紙は重さでばねのように伸び縮みする）。
    // 引き戻した分は前の位置も同じだけ動かし、速さは変えない
    for (let i = 0; i < n - 1; i++) {
      const dy = y[i + 1]! - y[i]!
      const dz = z[i + 1]! - z[i]!
      const d = Math.hypot(dy, dz) || 1e-6
      if (d <= rest[i]!) continue
      const ny = y[i]! + (dy / d) * rest[i]!
      const nz = z[i]! + (dz / d) * rest[i]!
      py[i + 1] = py[i + 1]! + ny - y[i + 1]!
      pz[i + 1] = pz[i + 1]! + nz - z[i + 1]!
      y[i + 1] = ny
      z[i + 1] = nz
    }
    // 床と、差し出し口の面
    for (let i = 1; i < n; i++) {
      if (z[i]! < 0) {
        z[i] = 0
        if (pz[i]! < 0) pz[i] = 0
      }
      if (y[i]! < THICK / 2) {
        y[i] = THICK / 2
        pz[i] = z[i]! - (z[i]! - pz[i]!) * FRICTION
      }
    }
  }

  /** 紙どうしが重ならないように押し離す（鎖の上で近い粒どうしは除く）。升目に分けて、近い粒だけを比べる */
  const collide = () => {
    const n = y.length
    const cells = new Map<number, number[]>()
    const cell = (a: number) => Math.floor(a / THICK)
    for (let i = 0; i < n; i++) {
      const key = cell(y[i]!) * 65536 + cell(z[i]!)
      const c = cells.get(key)
      if (c) c.push(i)
      else cells.set(key, [i])
    }
    for (let i = 1; i < n; i++) {
      const cy = cell(y[i]!)
      const cz = cell(z[i]!)
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const c = cells.get((cy + a) * 65536 + cz + b)
          if (!c) continue
          for (const j of c) {
            if (j <= i + 2 && j >= i - 2) continue
            if (j < i) continue
            const dy = y[j]! - y[i]!
            const dz = z[j]! - z[i]!
            const d = Math.hypot(dy, dz)
            if (d >= THICK || d < 1e-6) continue
            const k = ((THICK - d) / d) * 0.5
            y[i] = y[i]! - dy * k
            z[i] = z[i]! - dz * k
            y[j] = y[j]! + dy * k
            z[j] = z[j]! + dz * k
          }
        }
    }
  }

  /** sheets（新しい順）を、attach から続く1本の紙として1コマ進めて描く。width は紙の幅、floor は床の高さ（どちらも .rc-print の px）。
   * 返すのは紙が画面で届く下端（canvas の高さに使う）と、まだ動いているか */
  const frame = (sheets: Sheet[], attach: number, floor: number, width: number, w: number, h: number) => {
    if (w !== size.w || h !== size.h) {
      size = { w, h }
      renderer.setSize(w, h, false)
      camera.left = 0
      camera.right = w
      camera.top = 0
      camera.bottom = -h
      camera.updateProjectionMatrix()
      still = 0
    }
    const keys = sheets.map((s) => s.key)
    for (const [k, m] of meshes) if (!keys.includes(k)) drop(k, m)
    // 床が下がったら、積もった紙は画面の同じ所に残し、そこから落ちる
    if (lastFloor && floor !== lastFloor) {
      const d = floor - lastFloor
      for (let i = 0; i < y.length; i++) {
        y[i] = y[i]! + d
        py[i] = py[i]! + d
      }
      still = 0
    }
    lastFloor = floor
    const top = floor - attach
    if (keys.join(',') !== order) {
      order = keys.join(',')
      rebuild(sheets, top)
      still = 0
    }
    if (Math.abs(y[0]! - top) > 0.01) still = 0
    const now = performance.now()
    const dt = Math.min(1 / 30, lastTime ? (now - lastTime) / 1000 : 1 / 60) / SUB
    lastTime = now
    // 止まってしばらくしたら解くのも描くのもやめる
    if (still > 30) return { bottom: bottom(floor), moving: false }
    let moved = 0
    const oy = y.slice()
    const oz = z.slice()
    for (let s = 0; s < SUB; s++) step(dt, top)
    for (let i = 0; i < y.length; i++) moved = Math.max(moved, Math.abs(y[i]! - oy[i]!), Math.abs(z[i]! - oz[i]!))
    still = moved < 0.03 ? still + 1 : 0

    for (const s of sheets) {
      const at = starts.get(s.key)!
      const m = mesh(s, Math.max(2, Math.ceil(s.height / STEP)))
      const pos = m.geo.attributes.position as THREE.BufferAttribute
      const nor = m.geo.attributes.normal as THREE.BufferAttribute
      for (let j = 0; j <= m.rows; j++) {
        const i = at + j
        const a = Math.max(0, i - 1)
        const b = Math.min(y.length - 1, i + 1)
        // 紙の向き（下へ進む向き）から、刷った面の向きを求める。床に寝た面は傾けた床と同じく上と手前の間を向く
        const ty = y[b]! - y[a]!
        const tz = z[b]! - z[a]!
        const tl = Math.hypot(ty, tz) || 1
        const ny = tz / tl
        const nz = -ty / tl
        const ry = ny * COS
        const rz = nz + ny * SIN
        const rl = Math.hypot(ry, rz) || 1
        const v = floor - y[i]! + z[i]! * SIN
        const depth = z[i]! * COS + y[i]! * SIN
        for (let c = 0; c < 3; c++) {
          pos.setXYZ(j * 3 + c, margin + (c / 2) * width, -v, depth)
          nor.setXYZ(j * 3 + c, 0, ry / rl, rz / rl)
        }
      }
      pos.needsUpdate = true
      nor.needsUpdate = true
      m.geo.computeBoundingSphere()
    }
    renderer.render(scene, camera)
    return { bottom: bottom(floor), moving: true }
  }

  const bottom = (floor: number) => {
    let max = 0
    for (let i = 0; i < y.length; i++) max = Math.max(max, floor - y[i]! + z[i]! * SIN)
    return max + THICK
  }

  const dispose = () => {
    for (const [k, m] of meshes) drop(k, m)
    renderer.dispose()
  }
  return { frame, dispose }
}

/** 床に積もった紙が床より上に積もる高さの見積もり（床の高さを決めるのに使う。実際の積もり方は物理で決まる） */
export function pileAbove(length: number) {
  return Math.ceil(length / 160) * THICK + 48
}
