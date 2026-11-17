// 紙の DOM（.rc-paper）を canvas に写す。切り離して落とす紙（fall3d.ts）の絵と、シェアで渡すレシートの画像（receipt.tsx の Share）に使う。
// three.js を読まずに使えるよう、落とす処理とは別の module にしている

/** 紙の DOM（.rc-paper）を canvas に写す。scale は 1 CSS px あたりの画素（既定は画面の倍率、2 まで）。skip なら紙の上のボタンを写さない。字は1字ずつ、画面と同じ書体・色・位置に書く。点線・破線・アイコン・QR も同じ位置に描く */
export async function paperCanvas(el: HTMLElement, { scale, skip = false }: { scale?: number; skip?: boolean } = {}): Promise<HTMLCanvasElement> {
  const box = el.getBoundingClientRect()
  const dpr = scale ?? Math.min(window.devicePixelRatio || 1, 2)
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
    // 画像にして渡すときは、紙の上のボタン（data-snap="skip"）を写さない
    if (skip && node instanceof HTMLElement && node.dataset.snap === 'skip') return
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
