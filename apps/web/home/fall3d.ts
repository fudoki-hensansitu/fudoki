// 刷り直すときに切り離した前のレシートを、丸まりながら落とす（receipt.tsx から、切るときだけ読み込む）。
// 紙の DOM を同じ大きさの canvas に写し（paperCanvas）、three.js の細長い板に貼って、下の端から刷った面を外にして巻き上げ、
// 横へずれる螺旋にしながら落として消す。板は画面いっぱいの canvas（position: fixed）に、最初の姿が DOM の紙とぴったり重なるように置く
import * as THREE from 'three'

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** 紙の裏の色（刷っていない面） */
const BACK = 0xf4f1ea
/** 巻いた紙の半径と、1ラジアン巻くごとに横へずれる量（px）。紙の幅より大きく巻き、横へ流れる螺旋にする */
const RADIUS = 110
const PITCH = 45

/** 紙の DOM（.rc-paper）を canvas に写す。字は1字ずつ、画面と同じ書体・色・位置に書く。点線・破線・アイコン・QR も同じ位置に描く */
export async function paperCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const box = el.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(box.width * dpr)
  canvas.height = Math.ceil(box.height * dpr)
  const g = canvas.getContext('2d')!
  g.scale(dpr, dpr)
  const page = getComputedStyle(el)
  g.fillStyle = page.backgroundColor
  g.fillRect(0, 0, box.width, box.height)
  // 紙の頭は差し出し口の影に入る（receipt.css の .rc-paper::before）
  const shade = g.createLinearGradient(0, 0, 0, 40)
  shade.addColorStop(0, 'black')
  shade.addColorStop(0.45, 'transparent')
  g.globalAlpha = 0.18
  g.fillStyle = shade
  g.fillRect(0, 0, box.width, 40)
  g.globalAlpha = 1
  const line = (x0: number, y: number, x1: number, color: string, dash: number[]) => {
    g.save()
    g.strokeStyle = color
    g.lineWidth = 1
    g.setLineDash(dash)
    g.beginPath()
    g.moveTo(x0, y + 0.5)
    g.lineTo(x1, y + 0.5)
    g.stroke()
    g.restore()
  }
  const svgs: Promise<void>[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      const parent = node.parentElement
      if (!parent || !text.trim()) return
      const s = getComputedStyle(parent)
      g.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      g.fillStyle = s.color
      g.textBaseline = 'middle'
      if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
      const range = document.createRange()
      // 1字ずつ置く（折り返し・字間・揃えを画面のまま写す）
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!
        if (!ch.trim()) continue
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const r = range.getBoundingClientRect()
        if (!r.width) continue
        g.fillText(ch, r.left - box.left, r.top - box.top + r.height / 2)
      }
      return
    }
    if (!(node instanceof Element)) return
    const s = getComputedStyle(node)
    if (s.display === 'none' || s.visibility === 'hidden') return
    const r = node.getBoundingClientRect()
    const x = r.left - box.left
    const y = r.top - box.top
    if (s.borderTopStyle === 'dashed') line(x, y, x + r.width, s.borderTopColor, [3, 3])
    if (s.borderBottomStyle === 'dotted') line(x, y + r.height - 1, x + r.width, s.borderBottomColor, [1, 2])
    if (node instanceof SVGSVGElement) {
      // currentColor を画面の色に置き換えて画像にする
      const svg = node.cloneNode(true) as SVGSVGElement
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('width', String(r.width))
      svg.setAttribute('height', String(r.height))
      svg.setAttribute('color', s.color)
      const img = new Image()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`
      svgs.push(
        img
          .decode()
          .then(() => g.drawImage(img, x, y, r.width, r.height))
          .catch(() => {}),
      )
      return
    }
    node.childNodes.forEach(walk)
  }
  el.childNodes.forEach(walk)
  await Promise.all(svgs)
  return canvas
}

/** 紙を落とす。rect は紙の画面上の場所（CSS px）。最初の姿を描いてから返し、play で動かす。WebGL が使えなければ null */
export function fallPaper(texture: HTMLCanvasElement, rect: DOMRect, ms: number): { play: () => Promise<void>; seek: (t: number) => void; dispose: () => void } | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
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
  // 奥行き 0 の面が画面の px と1対1になる距離に置く
  const fov = 30
  const camera = new THREE.PerspectiveCamera(fov, vw / vh, 10, 20000)
  camera.position.set(0, 0, vh / 2 / Math.tan((fov * Math.PI) / 360))
  const scene = new THREE.Scene()
  // 平らなうちは DOM の紙と同じ明るさ（環境光と正面の光で 1 になる）。巻いて光に背を向けた所だけ暗くなる
  scene.add(new THREE.AmbientLight(0xffffff, 0.47 * Math.PI))
  const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI)
  sun.position.set(0, 0.25, 1)
  scene.add(sun)
  const W = rect.width
  const H = rect.height
  const rows = Math.max(120, Math.round(H / 6))
  const geo = new THREE.PlaneGeometry(W, H, 4, rows)
  const map = new THREE.CanvasTexture(texture)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const frontMat = new THREE.MeshLambertMaterial({ map, side: THREE.FrontSide, transparent: true })
  const backMat = new THREE.MeshLambertMaterial({ color: BACK, side: THREE.BackSide, transparent: true })
  const group = new THREE.Group()
  group.add(new THREE.Mesh(geo, frontMat), new THREE.Mesh(geo, backMat))
  // 板の原点を紙の上端の中央（切った線）に置き、そこを軸に傾ける
  geo.translate(0, -H / 2, 0)
  const top = new THREE.Vector3(rect.left + W / 2 - vw / 2, vh / 2 - rect.top, 0)
  group.position.copy(top)
  scene.add(group)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const base = Float32Array.from(pos.array as Float32Array)
  const ds = H / rows
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
      pos.setXYZ(i, base[i * 3]! + line[j * 3 + 2]! * PITCH, line[j * 3]!, line[j * 3 + 1]!)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  }
  /** t（ms）の姿を描く。切れて少し沈み、巻きながら傾いて、下へ落ちて消える */
  const seek = (t: number) => {
    const p = t / ms
    curl(smooth(0.02, 0.6, p))
    const drop = Math.max(0, p - 0.08)
    group.position.set(top.x - 30 * drop, top.y - 14 * smooth(0, 0.08, p) - 40 * drop - 700 * drop ** 3, 0)
    group.rotation.set(0.6 * smooth(0.05, 0.7, p), 0.5 * smooth(0.05, 0.8, p), -0.12 * smooth(0.1, 1, p))
    const o = 1 - smooth(0.75, 1, p)
    frontMat.opacity = o
    backMat.opacity = o
    renderer.render(scene, camera)
  }
  seek(0)
  let raf = 0
  let finish: (() => void) | null = null
  let gone = false
  /** 一度だけ片付ける。動いている途中なら描くのを止め、play を終わらせる */
  const dispose = () => {
    if (gone) return
    gone = true
    cancelAnimationFrame(raf)
    finish?.()
    geo.dispose()
    map.dispose()
    frontMat.dispose()
    backMat.dispose()
    renderer.dispose()
    canvas.remove()
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
        else done()
      }
      raf = requestAnimationFrame(step)
    })
  return { play, seek, dispose }
}
