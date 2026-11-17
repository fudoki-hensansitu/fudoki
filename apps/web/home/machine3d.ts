// ホームのうちのまちの札を、three.js で立体のレシートの機械として描き、平らな札から機械になる動きと、紙を送る動きを付ける。
// 形は Blender で組んだ model（public/home/receipt-machine.glb、組み方は brand/receipt_machine.py）。数字・ボタンは DOM の前面（body）に重ねたまま、
// ここは本体の形と光と動きだけを描く。
// model は基準の大きさ（幅 600・前面の高さ 420・奥行き 165）で組んであり、中心の帯（|x|<200・|y|<110）より外の頂点を平行に動かして、
// DOM の前面の大きさに伸ばす（9 分割。角の丸み・窓の縁・足は形を保つ）。差し出し口だけは紙の幅に合わせて横に一様に縮める。
// 本体は正面から見る正射影で、群れ（rig）を手前へ θ だけ倒して天板を見せる。前面の投影の高さ（H·cosθ）が DOM の前面の高さに、
// 天板の投影の高さ（D·sinθ）が DOM の天板の場所（.rm-top、--rm-top）の高さに一致するよう、毎フレーム合わせる。
// 動きは AnimationClip で持ち、AnimationMixer で進める。動いている間だけ毎フレーム描き、止まっているときは大きさが変わったときだけ描く
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MORPH_MS, PRINT_MS } from './motion'

const MODEL_URL = '/home/receipt-machine.glb'
/** model の基準の大きさ（brand/receipt_machine.py の W・H・D） */
const W0 = 600
const H0 = 420
const D0 = 165
/** 伸ばす帯の半幅。この内側には頂点が無い */
const BAND_X = 200
const BAND_Y = 110
/** 差し出し口の溝の幅（紙の最大幅と同じ） */
const SLOT_W = 440
/** 立体になり切ったときに倒す角度。天板（紙の蓋）がよく見えるよう、やや上から見下ろす */
const THETA = (22 * Math.PI) / 180
/** 立体になり切ったときの天板の見える高さ（px） */
const TOP = D0 * Math.sin(THETA)
/** 縁・足の切れを防ぐ余白（px） */
const PAD = 14
/** 平らな札のときの奥行きの倍率（0 だと面が潰れて描けない） */
const FLAT_DEPTH = 0.02

const MORPH_S = MORPH_MS / 1000
const PRINT_S = PRINT_MS / 1000

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
/** from から to へ ease-in-out で進む track を、keyframe を細かく打って作る */
function eased(name: string, from: number, to: number, start: number, len: number) {
  const n = 16
  const times = Array.from({ length: n + 1 }, (_, i) => start + (len * i) / n)
  const values = times.map((_, i) => from + (to - from) * easeInOut(i / n))
  return new THREE.NumberKeyframeTrack(name, times, values)
}

/** 平らな札 → 立体。奥行きが伸びながら手前へ倒れて天板が見え、終わりぎわに天板のボタンと灯がせり上がる */
const morphClip = () =>
  new THREE.AnimationClip('morph', MORPH_S, [
    eased('.scale[z]', FLAT_DEPTH, 1, 0, MORPH_S * 0.8),
    eased('.rotation[x]', 0, THETA, MORPH_S * 0.1, MORPH_S * 0.9),
    eased('deck.position[y]', -12, 0, MORPH_S * 0.6, MORPH_S * 0.4),
  ])

/** 紙送り。ボタンが沈んで戻り、刷っている間は灯がゆっくり明滅し、刷り終えたら灯ったままにする */
const printClip = () => {
  const blink = [0, 0.14, 0.31, 0.47, 0.64, 0.81, 1].map((f) => f * PRINT_S)
  return new THREE.AnimationClip('print', PRINT_S, [
    new THREE.NumberKeyframeTrack('btn.position[y]', [0, 0.25, 0.7], [0, -4, 0]),
    new THREE.NumberKeyframeTrack('lamp.material.emissiveIntensity', blink, [0.15, 1.4, 0.4, 1.4, 0.4, 1.4, 1]),
  ])
}

/** 基準の座標 v を、中心の帯より外だけ平行に動かす（帯の内側に頂点は無い） */
const stretch = (v: number, band: number, d: number) => (v > band ? v + d : v < -band ? v - d : v * ((band + d) / band))

/** 頂点を伸ばして使う mesh。base は基準の大きさの座標（rig の座標で、mesh の変換を焼き込んだもの） */
type Stretchy = { mesh: THREE.Mesh; base: Float32Array; kind: 'nine' | 'slot' }

export type Machine = {
  /** 平らな札から機械になる。instant なら動かさずに終わりの姿にする */
  morph(instant?: boolean): void
  /** 紙を送る動き。instant なら動かさずに終わりの姿にする */
  print(instant?: boolean): void
  stop(): void
}

/** host に canvas を置き、body（DOM の前面）の大きさに合わせて描く。描けない・model を読めなければ null（CSS の本体のまま）。
 * 途中で WebGL のコンテキストを失ったら lost を呼ぶ（呼ばれた側が後始末して CSS の本体へ戻す） */
export async function mountMachine(host: HTMLElement, body: HTMLElement, lost: () => void): Promise<Machine | null> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL).catch(() => null)
  if (!gltf || !host.isConnected) return null
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
  host.appendChild(canvas)

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
  const css = getComputedStyle(host)
  const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim())
  const brand = token('--brand')
  const black = new THREE.Color(0, 0, 0)
  const look: Record<string, { color: THREE.Color; roughness: number; emissive?: THREE.Color }> = {
    shell: { color: brand, roughness: 0.82 },
    panel: { color: brand.clone().lerp(black, 0.45), roughness: 0.9 },
    cover: { color: brand.clone().lerp(white, 0.07), roughness: 0.78 },
    knob: { color: token('--page'), roughness: 0.7 },
    led: { color: brand.clone().lerp(white, 0.6), roughness: 0.5, emissive: brand.clone().lerp(white, 0.6) },
    slot: { color: brand.clone().lerp(black, 0.8), roughness: 0.95 },
    rubber: { color: brand.clone().lerp(black, 0.75), roughness: 0.95 },
  }
  const materials = new Set<THREE.Material>()
  const geometries = new Set<THREE.BufferGeometry>()
  gltf.scene.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })
  // 部品の名前（body・cover・feet・slot・btn・lamp）で、mesh がどの部品の下にあるかを引く
  const partOf = (m: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = m; o; o = o.parent) if (['body', 'cover', 'feet', 'slot', 'btn', 'lamp'].includes(o.name)) return o.name
    return m.name.replace(/_\d+$/, '')
  }

  const rig = new THREE.Group()
  const stretchy: Stretchy[] = []
  // 天板の上の部品。anchor は天板の高さ、deck はせり上がる動き、btn・lamp は紙送りの動きを持つ
  const anchor = new THREE.Group()
  const deck = new THREE.Group()
  deck.name = 'deck'
  deck.position.y = -12
  anchor.add(deck)
  rig.add(anchor)
  /** btn・lamp の基準の据わる点（x・z）。y は天板の高さ（anchor）に置く */
  const seats: { holder: THREE.Group; x: number; z: number }[] = []

  for (const mesh of meshes) {
    const part = partOf(mesh)
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]
    for (const m of mats) {
      const l = look[m.name]
      if (l) {
        m.color.copy(l.color)
        m.roughness = l.roughness
        m.metalness = 0
        if (l.emissive) m.emissive.copy(l.emissive)
      }
      materials.add(m)
    }
    geometries.add(mesh.geometry)
    if (part === 'btn' || part === 'lamp') {
      // 据わる点を holder に、mesh の基準の位置からの差は mesh に残す（動きは mesh の y と灯の明るさ）
      const at = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld)
      const holder = new THREE.Group()
      const geo = mesh.geometry.clone()
      geometries.add(geo)
      geo.applyMatrix4(new THREE.Matrix4().extractRotation(mesh.matrixWorld))
      const m = new THREE.Mesh(geo, mesh.material)
      m.name = part
      holder.add(m)
      holder.position.y = at.y - H0 / 2
      seats.push({ holder, x: at.x, z: at.z })
      deck.add(holder)
      continue
    }
    // 頂点を rig の座標へ焼き込み、伸ばすときの基準として持つ
    const geo = mesh.geometry.clone()
    geometries.add(geo)
    geo.applyMatrix4(mesh.matrixWorld)
    const m = new THREE.Mesh(geo, mesh.material)
    rig.add(m)
    stretchy.push({ mesh: m, base: Float32Array.from(geo.getAttribute('position').array as ArrayLike<number>), kind: part === 'slot' ? 'slot' : 'nine' })
  }
  rig.scale.z = FLAT_DEPTH
  scene.add(rig)
  const camera = new THREE.OrthographicCamera()
  const mixer = new THREE.AnimationMixer(rig)
  const timer = new THREE.Timer()
  timer.connect(document)

  // w・h は DOM の前面の幅と高さ、H は立体になり切ったときの前面の高さ
  let w = 0
  let h = 0
  let H = 0

  /** 立体の度合い（rig の倒れと奥行き）に、前面の高さ・天板の高さ・canvas の位置を合わせて描く */
  const render = () => {
    if (!w || !h) return
    const theta = rig.rotation.x
    // 前面の投影を h に保つ
    rig.scale.y = h / Math.cos(theta) / H
    const t = D0 * rig.scale.z * Math.sin(theta)
    // 前面の下端を canvas の下の余白の上に揃える
    rig.position.y = (t - TOP) / 2
    canvas.style.top = `${t - TOP - PAD}px`
    host.style.setProperty('--rm-top', `${t}px`)
    renderer.render(scene, camera)
  }

  /** model を前面の大きさへ伸ばす */
  const fit = () => {
    const dx = w / 2 - W0 / 2
    const dy = H / 2 - H0 / 2
    // 紙（.rc-print）の幅に差し出し口を合わせる
    const slot = Math.min(1, Math.min(SLOT_W, w - 40) / SLOT_W)
    for (const s of stretchy) {
      const pos = s.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      const a = pos.array as Float32Array
      for (let i = 0; i < a.length; i += 3) {
        const x = s.base[i]!
        const y = s.base[i + 1]!
        a[i] = s.kind === 'slot' ? x * slot : stretch(x, BAND_X, dx)
        a[i + 1] = s.kind === 'slot' ? y - dy : stretch(y, BAND_Y, dy)
      }
      pos.needsUpdate = true
      s.mesh.geometry.computeBoundingSphere()
    }
    anchor.position.y = H / 2
    for (const s of seats) s.holder.position.set(stretch(s.x, BAND_X, dx), s.holder.position.y, s.z)
  }

  const layout = () => {
    const nw = body.clientWidth
    const nh = body.clientHeight
    if (!nw || !nh || (nw === w && nh === h)) return render()
    w = nw
    h = nh
    H = h / Math.cos(THETA)
    fit()
    const half = h / 2 + TOP / 2
    camera.left = -w / 2 - PAD
    camera.right = w / 2 + PAD
    camera.top = half + PAD
    camera.bottom = -half - PAD
    camera.near = 1
    camera.far = 4000
    camera.position.set(0, 0, 1500)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    renderer.setSize(w + PAD * 2, h + TOP + PAD * 2, false)
    canvas.style.left = `${-PAD}px`
    canvas.style.width = `${w + PAD * 2}px`
    canvas.style.height = `${h + TOP + PAD * 2}px`
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
  const morph = morphClip()
  const print = printClip()

  const ro = new ResizeObserver(layout)
  // 立体になるとき前面の余白が伸びるので、余白を含む大きさの変化で描き直す
  ro.observe(body, { box: 'border-box' })
  layout()
  return {
    morph: (instant = false) => play(morph, instant),
    print: (instant = false) => play(print, instant),
    stop() {
      canvas.removeEventListener('webglcontextlost', lost)
      ro.disconnect()
      renderer.setAnimationLoop(null)
      mixer.stopAllAction()
      mixer.uncacheRoot(rig)
      timer.dispose()
      host.style.removeProperty('--rm-top')
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
