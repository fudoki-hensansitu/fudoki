// ホームのうちのまちの札を、three.js で立体のレシートの機械として描き、平らな札から機械になる動きと、紙を送る動きを付ける。
// 数字・ボタンは DOM の前面（body）に重ねたまま、ここは本体の形と光と動きだけを描く。
// 本体は正面から見る正射影で、群れ（rig）を手前へ θ だけ倒して天板を見せる。前面の投影の高さ（H·cosθ）が DOM の前面の高さに、
// 天板の投影の高さ（D·sinθ）が DOM の天板（.rm-top、--rm-top）の高さに一致するよう、毎フレーム合わせる。
// 動きは AnimationClip で持ち、AnimationMixer で進める。動いている間だけ毎フレーム描き、止まっているときは大きさが変わったときだけ描く
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MORPH_MS, PRINT_MS } from './motion'

/** 天板の見える高さ（px）。立体になり切ったときの値 */
export const TOP = 40
/** 立体になり切ったときに倒す角度 */
const THETA = (14 * Math.PI) / 180
/** 縁の切れを防ぐ余白（px） */
const PAD = 12
/** 角の丸み（px）。平らな札（DOM）の角と同じ */
const RADIUS = 24
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
    eased('deck.position[y]', -14, 0, MORPH_S * 0.6, MORPH_S * 0.4),
  ])

/** 紙送り。ボタンが沈んで戻り、刷っている間は灯がゆっくり明滅し、刷り終えたら灯ったままにする */
const printClip = () => {
  const blink = [0, 0.14, 0.31, 0.47, 0.64, 0.81, 1].map((f) => f * PRINT_S)
  return new THREE.AnimationClip('print', PRINT_S, [
    new THREE.NumberKeyframeTrack('btn.position[y]', [0, 0.25, 0.7], [2, -3, 2]),
    new THREE.NumberKeyframeTrack('lamp.material.emissiveIntensity', blink, [0.2, 1.6, 0.6, 1.6, 0.6, 1.6, 1.2]),
  ])
}

export type Machine = {
  /** 平らな札から機械になる。instant なら動かさずに終わりの姿にする */
  morph(instant?: boolean): void
  /** 紙を送る動き。instant なら動かさずに終わりの姿にする */
  print(instant?: boolean): void
  stop(): void
}

/** host に canvas を置き、body（DOM の前面）の大きさに合わせて描く。描けなければ null（CSS の本体のまま）。
 * 途中で WebGL のコンテキストを失ったら lost を呼ぶ（呼ばれた側が後始末して CSS の本体へ戻す） */
export function mountMachine(host: HTMLElement, body: HTMLElement, lost: () => void): Machine | null {
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
  scene.environmentIntensity = 0.55
  // 色は DESIGN.md の token（--brand・--brand-fill-hover）を読む
  const css = getComputedStyle(host)
  const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim())
  const white = new THREE.Color(1, 1, 1)
  const key = new THREE.DirectionalLight(white, 1.6)
  key.position.set(-0.6, 1, 0.9)
  scene.add(key, new THREE.AmbientLight(white, 0.25))

  const brand = token('--brand')
  const glow = brand.clone().lerp(white, 0.6)
  const shell = new THREE.MeshPhysicalMaterial({ color: brand, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 })
  // 前面は光を受けない札の色そのものにし、平らな札（DOM）と継ぎ目なく入れ替える
  const face = new THREE.MeshBasicMaterial({ color: brand, toneMapped: false })
  const knob = new THREE.MeshPhysicalMaterial({ color: token('--brand-fill-hover'), roughness: 0.35, clearcoat: 0.4 })
  const led = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.2 })

  // BoxGeometry の面の順は +x, -x, +y, -y, +z（前面）, -z
  const box = new THREE.Mesh(new THREE.BufferGeometry(), [shell, shell, shell, shell, face, shell])
  // 天板の上の部品。anchor は天板の高さに置き、deck はせり上がる動き、btn・lamp は紙送りの動きを持つ
  const anchor = new THREE.Group()
  const deck = new THREE.Group()
  deck.name = 'deck'
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 8, 40), knob)
  btn.name = 'btn'
  btn.position.y = 2
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 12), led)
  lamp.name = 'lamp'
  lamp.position.y = 1
  deck.position.y = -14
  deck.add(btn, lamp)
  anchor.add(deck)
  const rig = new THREE.Group()
  rig.scale.z = FLAT_DEPTH
  rig.add(box, anchor)
  scene.add(rig)
  const camera = new THREE.OrthographicCamera()
  const mixer = new THREE.AnimationMixer(rig)
  const timer = new THREE.Timer()
  timer.connect(document)

  // 本体の大きさ（立体になり切ったときの寸法）。w・h は DOM の前面の幅と高さ
  let w = 0
  let h = 0
  let H = 0
  let D = 0

  /** 立体の度合い（rig の倒れと奥行き）に、前面の高さ・天板の高さ・canvas の位置を合わせて描く */
  const render = () => {
    if (!w || !h) return
    const theta = rig.rotation.x
    // 前面の投影を h に保つ
    rig.scale.y = h / Math.cos(theta) / H
    const top = D * rig.scale.z * Math.sin(theta)
    // 前面の下端を canvas の下の余白の上に揃える
    rig.position.y = (top - TOP) / 2
    canvas.style.top = `${top - TOP - PAD}px`
    host.style.setProperty('--rm-top', `${top}px`)
    renderer.render(scene, camera)
  }

  const layout = () => {
    const nw = body.clientWidth
    const nh = body.clientHeight
    if (!nw || !nh || (nw === w && nh === h)) return render()
    w = nw
    h = nh
    H = h / Math.cos(THETA)
    D = TOP / Math.sin(THETA)
    box.geometry.dispose()
    box.geometry = new RoundedBoxGeometry(w, H, D, 8, RADIUS)
    anchor.position.set(0, H / 2, 0)
    // 天板の右奥に、紙送りのボタンと通電の灯
    btn.position.set(w / 2 - 54, btn.position.y, -D * 0.08)
    lamp.position.set(w / 2 - 96, lamp.position.y, -D * 0.08)
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
    if (instant) {
      // 終わりまで一度に進めて、その姿で止める（finished は数えない）
      running++
      mixer.update(clip.duration + 0.01)
      return
    }
    running++
    if (running === 1) {
      timer.reset()
      renderer.setAnimationLoop(loop)
    }
  }
  const morph = morphClip()
  const print = printClip()

  const ro = new ResizeObserver(layout)
  ro.observe(body)
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
      box.geometry.dispose()
      btn.geometry.dispose()
      lamp.geometry.dispose()
      for (const m of [shell, face, knob, led]) m.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
