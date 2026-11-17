// ホームのうちのまちの札の後ろに置き、札の下端から差し出し口をのぞかせる、レジの本体。形は Blender で組んだ model（public/home/receipt-machine.glb、組み方は brand/receipt_machine.py）。
// model の原点は差し出し口の中心（紙が出てくる点）で、差し出し口の幅は紙の最大幅（SLOT_W）と同じ。本体が置き場の幅に収まるよう一様に拡大縮小し、DOM の紙（.rc-print）の幅を差し出し口に合わせ、
// 原点を置き場（stage）の下端の中央に置く。置き場の高さは札の下端から差し出し口までの短い帯（SLOT_GAP）で、本体の上の方は札（DOM、手前に重なる）の後ろに隠れる。紙は置き場のすぐ下から DOM で伸びる。
// 正射影で、群れ（rig）を手前へ θ 倒して鍵盤を見せる。最初から据わった姿で描き、紙を送る動きは AnimationClip で持ち、AnimationMixer で進める。
// 動いている間だけ毎フレーム描き、止まっているときは大きさが変わったときだけ描く
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { PRINT_MS } from './motion'

const MODEL_URL = '/home/receipt-machine.glb'
/** model の差し出し口の幅（紙の最大幅。receipt.css の .rc-print と同じ） */
const SLOT_W = 440
/** 見下ろす角度 */
const THETA = (20 * Math.PI) / 180
/** 縁・影の切れを防ぐ余白（px） */
const PAD = 16
/** 広い画面で本体を大きくする上限（紙は最大で SLOT_W × これ） */
const MAX_SCALE = 1.2
/** 札の下端から差し出し口までの間（px） */
const SLOT_GAP = 22
/** 紙をこれより狭くしない（px）。画面の幅が足りないときだけ下回る */
const MIN_PAPER = 300
/** 狭い画面で本体が置き場の左右へはみ出してよい量（px、頁の余白より小さく） */
const SIDE_OUT = 12

const PRINT_S = PRINT_MS / 1000

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
/** from から to へ緩急をつけて進む track を、keyframe を細かく打って作る */
function eased(name: string, from: number, to: number, start: number, len: number, ease = easeInOut) {
  const n = 20
  const times = Array.from({ length: n + 1 }, (_, i) => start + (len * i) / n)
  const values = times.map((_, i) => from + (to - from) * ease(i / n))
  return new THREE.NumberKeyframeTrack(name, times, values)
}

/** 紙送り。キーが押し込まれて戻り、刷っている間は灯がゆっくり明滅し、刷り終えたら灯ったままにする */
const printClip = (press: THREE.Vector3) => {
  const blink = [0, 0.14, 0.31, 0.47, 0.64, 0.81, 1].map((f) => f * PRINT_S)
  const at = (k: number) => [press.x * k, press.y * k, press.z * k]
  return new THREE.AnimationClip('print', PRINT_S, [
    new THREE.VectorKeyframeTrack('btn.position', [0, 0.25, 0.7], [...at(0), ...at(1), ...at(0)]),
    new THREE.NumberKeyframeTrack('lamp.material.emissiveIntensity', blink, [0.15, 1.4, 0.4, 1.4, 0.4, 1.4, 1]),
  ])
}

export type Printer = {
  /** 紙を送る動き。instant なら動かさずに終わりの姿にする */
  print(instant?: boolean): void
  stop(): void
}

/** stage（置き場）に canvas を置き、幅に合わせて描く。描けない・model を読めなければ null（CSS の差し出し口のまま）。
 * 途中で WebGL のコンテキストを失ったら lost を呼ぶ（呼ばれた側が後始末して CSS へ戻す） */
export async function mountPrinter(stage: HTMLElement, lost: () => void): Promise<Printer | null> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL).catch(() => null)
  if (!gltf || !stage.isConnected) return null
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  const canvas = renderer.domElement
  canvas.setAttribute('aria-hidden', 'true')
  canvas.addEventListener('webglcontextlost', lost)
  stage.appendChild(canvas)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  // 艶を抑えた樹脂に見せるため、映り込みは弱く、光は左上から柔らかく
  scene.environmentIntensity = 0.35
  const white = new THREE.Color(1, 1, 1)
  const key = new THREE.DirectionalLight(white, 1.3)
  key.position.set(-0.5, 1, 0.8)
  scene.add(key, new THREE.HemisphereLight(white, white.clone().multiplyScalar(0.4), 0.6))

  // 色は DESIGN.md の token（--brand・--page）から作り、model の material に名前で当てる
  const css = getComputedStyle(stage)
  const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim())
  const brand = token('--brand')
  const page = token('--page')
  const black = new THREE.Color(0, 0, 0)
  const glow = brand.clone().lerp(white, 0.6)
  const look: Record<string, { color: THREE.Color; roughness: number; metalness?: number; emissive?: THREE.Color }> = {
    shell: { color: brand, roughness: 0.82 },
    cover: { color: brand.clone().lerp(white, 0.08), roughness: 0.78 },
    slot: { color: brand.clone().lerp(black, 0.8), roughness: 0.95 },
    blade: { color: page.clone().lerp(black, 0.35), roughness: 0.45, metalness: 0.6 },
    knob: { color: page, roughness: 0.7 },
    led: { color: glow, roughness: 0.5, emissive: glow },
    rubber: { color: brand.clone().lerp(black, 0.75), roughness: 0.95 },
  }
  const materials = new Set<THREE.Material>()
  const geometries = new Set<THREE.BufferGeometry>()
  const model = gltf.scene
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry)
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
      const l = look[m.name]
      if (l) {
        m.color.copy(l.color)
        m.roughness = l.roughness
        m.metalness = l.metalness ?? 0
        if (l.emissive) m.emissive.copy(l.emissive)
      }
      materials.add(m)
    }
  })
  // キーは据わる点（holder）の中で動かし、灯は mesh の material の明るさを動かす（track は名前で引く）
  // 札とは離して置くので、画面を載せる支柱があれば外す
  for (const name of ['pole', 'mount']) model.getObjectByName(name)?.removeFromParent()
  const btn = model.getObjectByName('btn')
  let seat: THREE.Group | undefined
  if (btn?.parent) {
    seat = new THREE.Group()
    seat.position.copy(btn.position)
    btn.parent.add(seat)
    seat.add(btn)
    btn.position.set(0, 0, 0)
  }
  const lampRoot = model.getObjectByName('lamp')
  let lampMesh: THREE.Mesh | undefined
  lampRoot?.traverse((o) => {
    if (!lampMesh && (o as THREE.Mesh).isMesh) lampMesh = o as THREE.Mesh
  })
  if (lampRoot && lampMesh) {
    if (lampRoot !== lampMesh) lampRoot.name = 'lamp-root'
    lampMesh.name = 'lamp'
    ;(lampMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15
  }
  // キーは天板にあれば下へ（-y）、前面にあれば奥へ（-z）押し込む
  const onTop = !!seat && seat.position.y > 40
  const press = onTop ? new THREE.Vector3(0, -3, 0) : new THREE.Vector3(0, 0, -3)

  /** rig は動きを持つ群れ、fit は紙の幅に合わせる拡大縮小 */
  const rig = new THREE.Group()
  rig.add(model)
  const fit = new THREE.Group()
  fit.add(rig)
  scene.add(fit)
  const camera = new THREE.OrthographicCamera()
  const mixer = new THREE.AnimationMixer(rig)
  const timer = new THREE.Timer()
  timer.connect(document)
  const print = printClip(press)

  // 最初から据わった姿（手前へ θ 倒して鍵盤を見せる）で置く
  rig.rotation.x = THETA
  rig.updateMatrixWorld(true)
  /** 原点（差し出し口）から上と下・左右にどこまで見えるか（model の単位） */
  const reach = (() => {
    const box = new THREE.Box3().setFromObject(rig)
    return { up: box.max.y, down: -box.min.y, side: Math.max(box.max.x, -box.min.x) }
  })()

  let width = 0
  const render = () => {
    if (width) renderer.render(scene, camera)
  }
  const layout = () => {
    const w = stage.clientWidth
    if (!w || w === width) return render()
    width = w
    // 本体は札の幅の 7 割ほどにし、紙の幅は差し出し口に合わせる（--rm-paper）。
    // 狭い画面では紙を読める幅（MIN_PAPER）に保つため、本体は置き場の左右の余白（頁の余白）へ SIDE_OUT ずつはみ出してよい
    const scale = Math.min(MAX_SCALE, (w + SIDE_OUT * 2) / (reach.side * 2), Math.max((w * 0.7) / (reach.side * 2), MIN_PAPER / SLOT_W))
    stage.parentElement?.style.setProperty('--rm-paper', `${SLOT_W * scale}px`)
    fit.scale.setScalar(scale)
    const up = reach.up * scale + PAD
    const down = reach.down * scale + PAD
    const half = Math.max(w / 2, reach.side * scale)
    camera.left = -half
    camera.right = half
    camera.top = up
    camera.bottom = -down
    camera.near = -4000
    camera.far = 4000
    camera.updateProjectionMatrix()
    renderer.setSize(half * 2, up + down, false)
    // 置き場は据わった本体の上端から差し出し口までの高さ。canvas は上下の余白と紙の頭の後ろへはみ出す
    // 置き場は札の下端から差し出し口までの短い帯（SLOT_GAP）。本体の天板から上は札の後ろに隠し、札がレジの前の面に見えるようにする
    stage.style.height = `${SLOT_GAP}px`
    canvas.style.top = `${SLOT_GAP - up}px`
    canvas.style.left = `${w / 2 - half}px`
    canvas.style.width = `${half * 2}px`
    canvas.style.height = `${up + down}px`
    render()
  }

  // 動いている clip の数。0 になったら毎フレームの描画を止める
  let running = 0
  const loop = () => {
    timer.update()
    mixer.update(timer.getDelta())
    render()
  }
  mixer.addEventListener('finished', () => {
    running = Math.max(0, running - 1)
    if (!running) {
      renderer.setAnimationLoop(null)
      render()
    }
  })
  const play = (clip: THREE.AnimationClip, instant: boolean) => {
    const action = mixer.clipAction(clip)
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    running++
    if (instant) {
      // 終わりまで一度に進めて、その姿で止める（finished で数え戻す）
      mixer.update(clip.duration + 0.01)
      return
    }
    if (running === 1) {
      timer.reset()
      renderer.setAnimationLoop(loop)
    }
  }

  const ro = new ResizeObserver(layout)
  ro.observe(stage)
  layout()
  return {
    print: (instant = false) => play(print, instant),
    stop() {
      canvas.removeEventListener('webglcontextlost', lost)
      ro.disconnect()
      renderer.setAnimationLoop(null)
      mixer.stopAllAction()
      mixer.uncacheRoot(rig)
      timer.dispose()
      stage.style.removeProperty('height')
      stage.parentElement?.style.removeProperty('--rm-paper')
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
