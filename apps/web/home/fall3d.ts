// 刷り直すときに切り離した前のレシートを、丸まりながら床へ落として積み上げる（receipt.tsx が初めて紙を刷った時点で先に読み込む）。
// 紙の DOM を同じ大きさの canvas に写し（snap.ts の paperCanvas）、three.js の細長い板に貼って、下の端から刷った面を外にして巻き上げ、
// 横へずれる螺旋にしながら画面の下端（床）まで落とす。落ちた紙は消さずに床に残し、次の紙はその上に重なる。
// 板は画面いっぱいの canvas（position: fixed）に、最初の姿が DOM の紙とぴったり重なるように置く。canvas と落ちた紙は札を外すまで（clearFloor）持つ
import * as THREE from 'three'

export { paperCanvas } from './snap'

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 紙の裏の色（刷っていない面） */
const BACK = 0xf4f1ea
/** 巻いた紙の半径（px）。紙の幅より大きく巻く */
const RADIUS = 85
/** 1ラジアン巻くごとに横へずれる量（px）の上限。長い紙は、巻き終えたときに横へ紙の幅の半分ほどずれる螺旋になるよう小さくする（床で場所を取りすぎない） */
const PITCH = 45

/** 床に落ちた紙の山（x の幅と、山の上端の y）。床は画面の下端 */
type Pile = { x0: number; x1: number; top: number }
/** 落とす紙を描く場。画面の大きさが変わったら作り直す（床の位置が変わるので、積んだ紙も片付ける） */
type Stage = { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; vw: number; vh: number; piles: Pile[]; papers: Set<() => void> }
let stage: Stage | null = null

function openStage(): Stage | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (stage && (stage.vw !== vw || stage.vh !== vh)) clearFloor()
  if (stage) return stage
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '40' })
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    return null
  }
  document.body.appendChild(canvas)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(vw, vh, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // 正面から平行に写し、どの奥行きでも画面の px と1対1にする（巻いて奥へ回った所も床の高さがずれない）
  const camera = new THREE.OrthographicCamera(-vw / 2, vw / 2, vh / 2, -vh / 2, -5000, 5000)
  const scene = new THREE.Scene()
  // 平らなうちは DOM の紙と同じ明るさ（環境光と正面の光で 1 になる）。巻いて光に背を向けた所だけ暗くなる
  scene.add(new THREE.AmbientLight(0xffffff, 0.47 * Math.PI))
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI)
  sun.position.set(0, 0.25, 1)
  scene.add(sun)
  stage = { canvas, renderer, scene, camera, vw, vh, piles: [], papers: new Set() }
  return stage
}

/** 床に積んだ紙と描く場を片付ける（札を外すとき・画面の大きさが変わったとき） */
export function clearFloor() {
  if (!stage) return
  const s = stage
  stage = null
  for (const drop of [...s.papers]) drop()
  s.renderer.dispose()
  s.canvas.remove()
}

/** 紙を落とす。rect は紙の画面上の場所（CSS px）。最初の姿を描いてから返し、play で動かす。落ち終えた紙は床に残る。WebGL が使えなければ null */
export function fallPaper(texture: HTMLCanvasElement, rect: DOMRect, ms: number): { play: () => Promise<void>; seek: (t: number) => void; dispose: () => void } | null {
  const st = openStage()
  if (!st) return null
  const { vw, vh, scene, renderer, camera } = st
  const W = rect.width
  const H = rect.height
  const rows = Math.max(120, Math.round(H / 6))
  const geo = new THREE.PlaneGeometry(W, H, 4, rows)
  const map = new THREE.CanvasTexture(texture)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const frontMat = new THREE.MeshLambertMaterial({ map, side: THREE.FrontSide })
  const backMat = new THREE.MeshLambertMaterial({ color: BACK, side: THREE.BackSide })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, frontMat), new THREE.Mesh(geo, backMat))
  // 板の原点を紙の上端の中央（切った線）に置き、そこを軸に傾ける
  geo.translate(0, -H / 2, 0)
  const top = new THREE.Vector3(rect.left + W / 2 - vw / 2, vh / 2 - rect.top, 0)
  scene.add(group)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const base = Float32Array.from(pos.array as Float32Array)
  const ds = H / rows
  const pitch = Math.min(PITCH, (0.5 * W * RADIUS) / H)
  const line = new Float32Array((rows + 1) * 3)
  /** p（0〜1）だけ巻く。巻く所は下の端から上へ伸び、刷った面を外にして奥へ巻き上がる */
  const curl = (p: number) => {
    const start = H - H * p
    let th = 0
    let y = 0
    let z = 0
    for (let j = 0; j <= rows; j++) {
      line[j * 3] = y
      line[j * 3 + 1] = z
      line[j * 3 + 2] = th
      th += (smooth(start, start + 60, j * ds) / RADIUS) * ds
      y -= Math.cos(th) * ds
      z -= Math.sin(th) * ds
    }
    for (let i = 0; i < pos.count; i++) {
      const j = Math.min(rows, Math.max(0, Math.round(-base[i * 3 + 1]! / ds)))
      pos.setXYZ(i, base[i * 3]! + line[j * 3 + 2]! * pitch, line[j * 3]!, line[j * 3 + 1]!)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
  }
  const turn = (p: number) => group.rotation.set(0.6 * smooth(0.05, 0.7, p), 0.5 * smooth(0.05, 0.8, p), -0.12 * smooth(0.1, 1, p))
  // 落ち着く場所を先に決める。丸まりきった姿の外形を測り、紙の下あたりの床（先に落ちた紙と横が重なれば、その山の上）に置く
  curl(1)
  turn(1)
  group.position.set(0, 0, 0)
  group.updateMatrixWorld(true)
  // 頂点から測る（板の箱を回した外形だと大きく出て、床から浮く）
  const box = new THREE.Box3().setFromObject(group, true)
  const bw = box.max.x - box.min.x
  const bh = box.max.y - box.min.y
  // 紙の中心は画面の端まで置いてよい（半分は画面の外に出る）。広い画面では左右に並べ、重ねるのは場所が無くなってから
  const room = Math.max(0, vw / 2 - Math.min(bw / 2, vw / 4))
  // 床で一番低く収まる所に置く（紙の下あたりを少し好む）。山に乗るときは少し沈み込ませる（丸まった紙どうしは隙間に収まる）
  const restAt = (c: number) => st.piles.reduce((y, p) => (p.x1 > c - bw / 2 && p.x0 < c + bw / 2 ? Math.max(y, p.top - bh * 0.45) : y), -vh / 2)
  const tries = Array.from({ length: 9 }, (_, i) => (room * (i - 4)) / 4)
  const score = tries.map((c) => restAt(c) + Math.abs(c - top.x) * 0.05 + Math.random() * 6)
  const cx = tries[score.indexOf(Math.min(...score))]!
  const x0 = cx - bw / 2
  const x1 = cx + bw / 2
  const rest = restAt(cx)
  const pile = { x0, x1, top: rest + bh }
  st.piles.push(pile)
  const end = new THREE.Vector3(cx - (box.min.x + box.max.x) / 2, rest - box.min.y, 0)
  /** t（ms）の姿を描く。切れて少し沈み、巻きながら傾いて、床へ落ちて小さく跳ねる */
  const seek = (t: number) => {
    const p = t / ms
    curl(smooth(0.02, 0.6, p))
    turn(p)
    const q = Math.min(1, Math.max(0, (p - 0.08) / 0.92))
    const from = top.y - 14 * smooth(0, 0.08, p)
    // 0.86 まで重さで速くなりながら落ち、床に当たって一度だけ小さく跳ねる
    const y = q < 0.86 ? from + (end.y - from) * (q / 0.86) ** 2 : end.y + 16 * Math.sin((Math.PI * (q - 0.86)) / 0.14)
    group.position.set(top.x + (end.x - top.x) * smooth(0.08, 1, p), y, 0)
    renderer.render(scene, camera)
  }
  seek(0)
  let raf = 0
  let finish: (() => void) | null = null
  let gone = false
  /** 紙を場から外す。床に残った紙も clearFloor でここを通る */
  const remove = () => {
    if (gone) return
    gone = true
    cancelAnimationFrame(raf)
    finish?.()
    st.papers.delete(remove)
    st.piles.splice(st.piles.indexOf(pile), 1)
    scene.remove(group)
    geo.dispose()
    map.dispose()
    frontMat.dispose()
    backMat.dispose()
    if (stage === st) renderer.render(scene, camera)
  }
  st.papers.add(remove)
  let landed = false
  /** 落ちている途中なら止めて外す。落ち終えた紙は床に残す */
  const dispose = () => {
    if (!landed) remove()
  }
  const play = () =>
    new Promise<void>((done) => {
      if (gone) return done()
      finish = done
      const t0 = performance.now()
      const step = (now: number) => {
        const t = now - t0
        seek(Math.min(t, ms))
        if (t < ms) raf = requestAnimationFrame(step)
        else {
          landed = true
          finish = null
          done()
        }
      }
      raf = requestAnimationFrame(step)
    })
  return { play, seek, dispose }
}
