import { getDocument, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/build/pdf.mjs'
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs'

// MCP sandbox の worker-src に依存せず、同梱した handler で処理する。
Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler } })

export interface PdfLocation {
  source_page: number | null
  source_x0: number | null
  source_y0: number | null
  source_x1: number | null
  source_y1: number | null
  amount_source_page: number | null
  amount_source_x0: number | null
  amount_source_y0: number | null
  amount_source_x1: number | null
  amount_source_y1: number | null
}
interface Origin { origin_id: string; title: string; url: string }
const panel = document.getElementById('pdf-view')!
let cleanup = () => {}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', attrs: Record<string, string> = {}) {
  const node = document.createElement(tag)
  node.textContent = text
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

export function closePdf() { cleanup(); panel.hidden = true; panel.removeAttribute('aria-busy'); panel.removeAttribute('data-state'); panel.replaceChildren() }

/** 明細の位置を保ったまま、表示領域内でPDFの頁を確認する。 */
export async function showPdf(origin: Origin, location: PdfLocation, selectedPage: number, apiOrigin: string, openLink: (url: string) => void, trigger: HTMLElement) {
  closePdf()
  const abort = new AbortController()
  let task: PDFDocumentLoadingTask | undefined
  let pdf: PDFDocumentProxy | undefined
  let rendering: RenderTask | undefined
  let renderVersion = 0
  cleanup = () => { abort.abort(); renderVersion++; rendering?.cancel(); void task?.destroy() }
  const close = el('button', '閉じる', { type: 'button' })
  close.onclick = () => { closePdf(); trigger.focus() }
  const title = el('h3', origin.title, { id: 'pdf-title' })
  const url = el('a', origin.url, { href: origin.url, class: 'pdf-url' })
  url.onclick = (e) => { e.preventDefault(); openLink(origin.url) }
  const fetched = el('p', '', { class: 'muted small' })
  const warning = el('p', '自治体の公開 URL から取得します。取り込み時の原典と内容が異なる可能性があります。', { class: 'muted small' })
  const status = el('p', 'PDF を取得中…', { role: 'status' })
  const toolbar = el('div', '', { class: 'toolbar' })
  const content = el('div', '', { class: 'pdf-scroll' })
  const stage = el('div', '', { class: 'pdf-stage' })
  content.append(stage)
  panel.append(el('div', '', { class: 'toolbar' }), title, url, fetched, warning, toolbar, status, content)
  panel.firstElementChild!.append(close)
  panel.hidden = false
  panel.setAttribute('aria-busy', 'true')
  panel.dataset.state = 'loading'
  close.focus()
  panel.scrollIntoView({ block: 'start' })

  let pageNumber = selectedPage
  const pages = [...new Set([location.source_page, location.amount_source_page].filter((p): p is number => p !== null && Number.isInteger(p) && p > 0))]
  const buttons = pages.map((p) => {
    const kinds = [p === location.source_page ? '項目' : '', p === location.amount_source_page ? '金額' : ''].filter(Boolean).join('・')
    const b = el('button', `${kinds} ${p}ページ`, { type: 'button', disabled: '' })
    b.onclick = () => { pageNumber = p; void draw() }
    toolbar.append(b)
    return b
  })
  const zoom = el('select', '', { 'aria-label': 'PDF の拡大率' })
  for (const [value, label] of [['100', '頁幅に合わせる'], ['150', '150%'], ['200', '200%']]) zoom.append(el('option', label, { value: value! }))
  zoom.onchange = () => { stage.style.width = `${zoom.value}%` }
  toolbar.append(zoom)

  function highlight(kind: 'source' | 'amount_source', width: number, height: number) {
    if (location[`${kind}_page`] !== pageNumber) return false
    const box = [location[`${kind}_x0`], location[`${kind}_y0`], location[`${kind}_x1`], location[`${kind}_y1`]]
    if (!box.every((v): v is number => typeof v === 'number' && Number.isFinite(v))) return false
    const [x0, y0, x1, y1] = box as [number, number, number, number]
    if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0 || x1 > width || y1 > height) return false
    const name = kind === 'source' ? '項目' : '金額'
    const frame = el('div', '', { class: `pdf-frame ${kind}`, role: 'img', 'aria-label': `${name}の印字枠` })
    Object.assign(frame.style, { left: `${x0 / width * 100}%`, top: `${y0 / height * 100}%`, width: `${(x1 - x0) / width * 100}%`, height: `${(y1 - y0) / height * 100}%` })
    stage.append(frame)
    return true
  }

  async function draw() {
    if (!pdf || abort.signal.aborted) return
    const version = ++renderVersion
    rendering?.cancel()
    panel.setAttribute('aria-busy', 'true')
    panel.dataset.state = 'loading'
    stage.replaceChildren()
    status.classList.remove('error')
    status.textContent = `PDF ファイルの ${pageNumber}ページを描画中…`
    buttons.forEach((b, i) => { b.disabled = false; b.setAttribute('aria-pressed', String(pages[i] === pageNumber)) })
    try {
      if (pageNumber > pdf.numPages) throw new Error('原典の頁数が明細の頁番号より少なくなっています')
      const page = await pdf.getPage(pageNumber)
      if (version !== renderVersion || abort.signal.aborted) return
      const points = page.getViewport({ scale: 1 })
      const scale = Math.min(2, Math.sqrt(4_000_000 / (points.width * points.height)))
      const viewport = page.getViewport({ scale })
      const canvas = el('canvas', '', { role: 'img', 'aria-label': `原典 PDF ${pageNumber}ページ` })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      rendering = page.render({ canvas, viewport })
      await rendering.promise
      if (version !== renderVersion || abort.signal.aborted) return
      stage.replaceChildren(canvas)
      const item = highlight('source', points.width, points.height)
      const amount = highlight('amount_source', points.width, points.height)
      const frame = stage.querySelector<HTMLElement>('.pdf-frame')
      content.scrollTop = frame ? Math.max(0, frame.offsetTop - (content.clientHeight - frame.offsetHeight) / 2) : 0
      status.textContent = `PDF ファイルの ${pageNumber} / ${pdf.numPages}ページ（紙面の印刷頁番号とは別） ・ ${[item ? '項目の枠' : '', amount ? '金額の枠' : ''].filter(Boolean).join('・') || '強調できる単一頁の枠はありません'}`
      page.cleanup()
      panel.removeAttribute('aria-busy')
      panel.dataset.state = 'success'
    } catch (e) {
      if (version === renderVersion && !abort.signal.aborted) fail(e)
    }
  }

  function fail(e: unknown) {
    panel.removeAttribute('aria-busy')
    panel.dataset.state = 'error'
    status.classList.add('error')
    status.textContent = `原典 PDF を表示できません。項目: ${location.source_page ?? '不明'}ページ / 金額: ${location.amount_source_page ?? '不明'}ページ。${e instanceof Error ? e.message : ''}`
  }

  try {
    const response = await fetch(`${apiOrigin}/v1/origins/${encodeURIComponent(origin.origin_id)}/pdf`, { signal: abort.signal, credentials: 'omit' })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
    }
    const fetchedUrl = response.headers.get('X-Origin-Url')
    const fetchedAt = response.headers.get('X-Origin-Fetched-At')
    if (!fetchedUrl || !fetchedAt) throw new Error('取得情報がありません')
    const actualUrl = decodeURIComponent(fetchedUrl)
    url.textContent = `取得 URL: ${actualUrl}`
    url.href = actualUrl
    url.onclick = (e) => { e.preventDefault(); openLink(actualUrl) }
    fetched.textContent = `取得日時: ${fetchedAt}`
    task = getDocument({ data: new Uint8Array(await response.arrayBuffer()), useWasm: false, useWorkerFetch: false, disableFontFace: true })
    pdf = await task.promise
    await draw()
  } catch (e) { if (!abort.signal.aborted) fail(e) }
}
