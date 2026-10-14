import { useEffect, useRef, useState } from 'react'
import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist/build/pdf.mjs'
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs'
import { Button } from '@fudoki/ui/components/button'
import { Alert, AlertDescription } from '@fudoki/ui/components/alert'
import { Skeleton } from '@fudoki/ui/components/skeleton'
import type { Origin, PdfLocation } from './types'

Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler } })

export interface PdfSelection {
  origin: Origin
  location: PdfLocation
  selectedPage: number
  trigger: HTMLElement
}
interface Sheet {
  page: number
  width: number
  height: number
}

function spreadPages(initial: number[], numPages?: number, start?: number) {
  if (numPages === undefined) return initial
  if (start !== undefined) return [start, start + 1].filter((page) => page <= numPages)
  if (initial.length > 1 || numPages <= 1) return initial
  const first = Math.min(initial[0]!, numPages - 1)
  return [first, first + 1]
}

function frameStyle(
  location: PdfLocation,
  sheet: Sheet,
  kind: 'source' | 'amount_source',
) {
  if (location[`${kind}_page`] !== sheet.page) return null
  const box = [
    location[`${kind}_x0`],
    location[`${kind}_y0`],
    location[`${kind}_x1`],
    location[`${kind}_y1`],
  ]
  if (
    !box.every((v): v is number => typeof v === 'number' && Number.isFinite(v))
  )
    return null
  const [x0, y0, x1, y1] = box as [number, number, number, number]
  if (
    x0 < 0 ||
    y0 < 0 ||
    x1 <= x0 ||
    y1 <= y0 ||
    x1 > sheet.width ||
    y1 > sheet.height
  )
    return null
  return {
    left: `${(x0 / sheet.width) * 100}%`,
    top: `${(y0 / sheet.height) * 100}%`,
    width: `${((x1 - x0) / sheet.width) * 100}%`,
    height: `${((y1 - y0) / sheet.height) * 100}%`,
  }
}
function Frame({
  location,
  sheet,
  kind,
}: {
  location: PdfLocation
  sheet: Sheet
  kind: 'source' | 'amount_source'
}) {
  const style = frameStyle(location, sheet, kind)
  return style ? (
    <>
    <div className={`pdf-guide pdf-guide-x ${kind}`} aria-hidden="true" style={{ top: `${parseFloat(style.top) + parseFloat(style.height) / 2}%` }} />
    <div className={`pdf-guide pdf-guide-y ${kind}`} aria-hidden="true" style={{ left: `${parseFloat(style.left) + parseFloat(style.width) / 2}%` }} />
    <div
      className={`pdf-frame ${kind}`}
      role="img"
      aria-label={`${kind === 'source' ? '項目' : '金額'}の印字枠`}
      style={style}
    />
    </>
  ) : null
}

export function PdfViewer({
  selection,
  apiOrigin,
  onClose,
  openLink,
}: {
  selection: PdfSelection
  apiOrigin: string
  onClose: () => void
  openLink: (url: string) => void
}) {
  const { origin, location, selectedPage } = selection
  const initialPages = [
    ...new Set(
      [location.source_page, location.amount_source_page].filter(
        (p): p is number =>
          typeof p === 'number' && Number.isInteger(p) && p > 0,
      ),
    ),
  ]
  const [document, setDocument] = useState<PDFDocumentProxy>()
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [spreadStart, setSpreadStart] = useState<number>()
  const [status, setStatus] = useState('PDF を取得中…')
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)
  const [fetched, setFetched] = useState<{ url: string; at: string }>()
  const panel = useRef<HTMLElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const canvases = useRef(new Map<number, HTMLCanvasElement>())
  const reportError = (error: unknown) => {
    setError(true)
    setStatus(
      `参照の PDF を表示できません。項目: ${location.source_page ?? '不明'}ページ / 金額: ${location.amount_source_page ?? '不明'}ページ。${error instanceof Error ? error.message : ''}`,
    )
  }

  useEffect(() => {
    const abort = new AbortController()
    let task: PDFDocumentLoadingTask | undefined
    close.current?.focus()
    panel.current?.scrollIntoView({ block: 'start' })
    // StrictModeの最初のsetup/cleanupでは取得せず、残ったsetupだけが開始する。
    queueMicrotask(() => {
      void (async () => {
        if (abort.signal.aborted) return
        try {
          const response = await fetch(
            `${apiOrigin}/v1/origins/${encodeURIComponent(origin.origin_id)}/pdf`,
            { signal: abort.signal, credentials: 'omit' },
          )
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
              error?: { message?: string }
            } | null
            throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
          }
          const url = response.headers.get('X-Origin-Url')
          const at = response.headers.get('X-Origin-Fetched-At')
          if (!url || !at) throw new Error('取得情報がありません')
          if (abort.signal.aborted) return
          setFetched({ url: decodeURIComponent(url), at })
          const data = new Uint8Array(await response.arrayBuffer())
          if (abort.signal.aborted) return
          task = getDocument({
            data,
            useWasm: false,
            useWorkerFetch: false,
            disableFontFace: true,
          })
          const pdf = await task.promise
          if (abort.signal.aborted) return
          if (!initialPages.length || initialPages.some((p) => p > pdf.numPages))
            throw new Error('原典の頁数が明細の頁番号より少なくなっています')
          setDocument(pdf)
        } catch (e) {
          if (abort.signal.aborted) return
          reportError(e)
        }
      })()
    })
    return () => {
      abort.abort()
      void task?.destroy().catch(() => {})
    }
  }, [selection, apiOrigin])

  const pages = spreadPages(initialPages, document?.numPages, spreadStart)
  const pageKey = pages.join(',')
  useEffect(() => {
    if (!document) return
    let cancelled = false
    setReady(false)
    setSheets([])
    setStatus('PDF を描画中…')
    void (async () => {
      try {
        const dimensions: Sheet[] = []
        for (const number of pages) {
          const page = await document.getPage(number)
          const viewport = page.getViewport({ scale: 1 })
          dimensions.push({ page: number, width: viewport.width, height: viewport.height })
        }
        if (!cancelled) setSheets(dimensions)
      } catch (e) { if (!cancelled) reportError(e) }
    })()
    return () => { cancelled = true }
  }, [document, pageKey])

  useEffect(() => {
    if (!document || !sheets.length) return
    let cancelled = false
    let rendering: RenderTask | undefined
    const activeCanvases = [...canvases.current.values()]
    void (async () => {
      try {
        for (const sheet of sheets) {
          if (cancelled) return
          setStatus(`PDF ファイルの ${sheet.page}ページを描画中…`)
          const page = await document.getPage(sheet.page)
          if (cancelled) return
          try {
            const scale = Math.min(
              2,
              Math.sqrt(
                4_000_000 / sheets.length / (sheet.width * sheet.height),
              ),
              8192 / Math.max(sheet.width, sheet.height),
            )
            const viewport = page.getViewport({ scale })
            const canvas = canvases.current.get(sheet.page)!
            canvas.width = Math.max(1, Math.floor(viewport.width))
            canvas.height = Math.max(1, Math.floor(viewport.height))
            rendering = page.render({ canvas, viewport })
            await rendering.promise
          } finally {
            page.cleanup()
          }
        }
        if (cancelled) return
        setStatus(`${sheets.map((s) => s.page).join('・')} / ${document.numPages}ページ`)
        setReady(true)
      } catch (e) {
        if (cancelled) return
        reportError(e)
      }
    })()
    return () => {
      cancelled = true
      rendering?.cancel()
      for (const canvas of activeCanvases) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [document, sheets, location])

  useEffect(() => {
    if (!ready || !scroll.current) return
    const stage = panel.current?.querySelector<HTMLElement>(
      `[data-page="${selectedPage}"] .pdf-stage`,
    )
    const frame = stage?.querySelector<HTMLElement>('.pdf-frame')
    scroll.current.scrollTop =
      frame && stage
        ? Math.max(
            0,
            stage.offsetTop +
              frame.offsetTop -
              (scroll.current.clientHeight - frame.offsetHeight) / 2,
          )
        : 0
    scroll.current.scrollLeft = stage?.parentElement?.offsetLeft ?? 0
  }, [ready, selectedPage, pageKey])

  const url = fetched?.url ?? origin.url
  return (
    <section
      id="pdf-view"
      ref={panel}
      aria-labelledby="pdf-title"
      aria-busy={!ready && !error}
      data-state={error ? 'error' : ready ? 'success' : 'loading'}
      className="flex min-w-0 flex-col gap-3"
    >
      <h3 id="pdf-title" className="sr-only">{origin.title}</h3>
      <div className="toolbar">
        <Button ref={close} variant="ghost" size="sm" onClick={onClose}>← 明細</Button>
        <span className="pager">
          <Button variant="outline" size="icon-sm" aria-label="前のページ" disabled={!ready || Math.min(...pages) <= 1}
            onClick={() => setSpreadStart(Math.max(1, Math.min(...pages) - 2))}>‹</Button>
          {!error && <span role="status" className="pager-status">{status}</span>}
          <Button variant="outline" size="icon-sm" aria-label="次のページ" disabled={!ready || !document || Math.max(...pages) >= document.numPages}
            onClick={() => setSpreadStart(Math.min(document!.numPages - 1, Math.max(...pages) + 1))}>›</Button>
        </span>
        <a className="pdf-url" href={url} title={url} onClick={(event) => { event.preventDefault(); openLink(url) }}>参照元 ↗</a>
      </div>
      {error && <Alert variant="destructive" role="status"><AlertDescription>{status}</AlertDescription></Alert>}
      {!ready && !error && <Skeleton className="h-6 w-full" />}
      <div
        ref={scroll}
        className="pdf-scroll"
        role="region"
        aria-label="原典 PDF のページ（見開き・スクロール可能）"
        tabIndex={0}
      >
        <div
          className="pdf-spread"
          data-pages={pages.length}
        >
          {sheets.map((sheet) => (
            <section
              key={sheet.page}
              data-page={sheet.page}
              className="pdf-sheet"
              aria-label={`${[sheet.page === location.source_page ? '項目' : '', sheet.page === location.amount_source_page ? '金額' : ''].filter(Boolean).join('・')} ${sheet.page}ページ`}
            >
              <h4>
                {[
                  sheet.page === location.source_page ? '項目' : '',
                  sheet.page === location.amount_source_page ? '金額' : '',
                ]
                  .filter(Boolean)
                  .join('・')}{' '}
                {sheet.page}ページ
              </h4>
              <div className="pdf-stage">
                <canvas
                  ref={(canvas) => {
                    if (canvas) canvases.current.set(sheet.page, canvas)
                    else canvases.current.delete(sheet.page)
                  }}
                  role="img"
                  aria-label={`原典 PDF ${sheet.page}ページ`}
                />
                <Frame location={location} sheet={sheet} kind="source" />
                <Frame location={location} sheet={sheet} kind="amount_source" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
