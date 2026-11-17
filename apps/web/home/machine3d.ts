// ホームのうちのまちの札を、three.js で立体のレシートの機械として描く。数字・ボタンは DOM の前面（body）に重ねたまま、ここは本体の形と光だけを描く。
// 正射影のカメラを θ だけ上から見下ろし、前面の投影の高さが DOM の前面の高さに、天板の投影の高さが TOP に一致するよう、本体の寸法を合わせる。
// 動かさないので、描くのは大きさが変わったときだけ（毎フレームは描かない）
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** 天板の見える高さ（px）。DOM の天板（.rm-top）の高さと同じ */
export const TOP = 40
/** 見下ろす角度 */
const THETA = (14 * Math.PI) / 180
/** 縁の切れを防ぐ余白（px） */
const PAD = 12

/** host に canvas を置き、body（DOM の前面）の大きさに合わせて描き続ける。描けなければ null（CSS の本体のまま） */
export function mountMachine(host: HTMLElement, body: HTMLElement): (() => void) | null {
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
  const knob = new THREE.MeshPhysicalMaterial({ color: token('--brand-fill-hover'), roughness: 0.35, clearcoat: 0.4 })
  const led = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.2 })
  const group = new THREE.Group()
  scene.add(group)
  const camera = new THREE.OrthographicCamera()

  const draw = () => {
    const w = body.clientWidth
    const h = body.clientHeight
    if (!w || !h) return
    // 前面の投影 = H·cosθ = h、天板の投影 = D·sinθ = TOP
    const H = h / Math.cos(THETA)
    const D = TOP / Math.sin(THETA)
    group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    group.clear()
    const box = new THREE.Mesh(new RoundedBoxGeometry(w, H, D, 8, Math.min(26, h / 6)), shell)
    group.add(box)
    // 天板の右奥に、紙送りのボタンと通電の灯
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 8, 40), knob)
    btn.position.set(w / 2 - 54, H / 2 + 2, -D * 0.08)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 12), led)
    lamp.position.set(w / 2 - 96, H / 2 + 1, -D * 0.08)
    group.add(btn, lamp)
    const half = h / 2 + TOP / 2
    camera.left = -w / 2 - PAD
    camera.right = w / 2 + PAD
    camera.top = half + PAD
    camera.bottom = -half - PAD
    camera.near = 1
    camera.far = 4000
    camera.position.set(0, Math.sin(THETA) * 1500, Math.cos(THETA) * 1500)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    renderer.setSize(w + PAD * 2, h + TOP + PAD * 2, false)
    canvas.style.width = `${w + PAD * 2}px`
    canvas.style.height = `${h + TOP + PAD * 2}px`
    renderer.render(scene, camera)
  }
  const ro = new ResizeObserver(draw)
  ro.observe(body)
  draw()
  return () => {
    ro.disconnect()
    group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    shell.dispose()
    knob.dispose()
    led.dispose()
    env.dispose()
    pmrem.dispose()
    renderer.dispose()
    canvas.remove()
  }
}
