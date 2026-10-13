import { Miniflare } from 'miniflare'
import columns from '../src/columns.json'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function samplePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>']
  for (let p = 0; p < 2; p++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4 + p * 2} 0 R >>`)
    const stream = `BT /F1 20 Tf 40 740 Td (PAGE ${p + 1} - Item) Tj 0 -100 Td (Amount 12345) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let text = '%PDF-1.7\n'
  const offsets = [0]
  objects.forEach((o, i) => { offsets.push(text.length); text += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = text.length
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return text
}

export async function fixture(real = false) {
  const hits = new Map<string, number>()
  let fail = true
  const upstream = Bun.serve({ port: 0, idleTimeout: 30, async fetch(req) {
    const path = new URL(req.url).pathname
    hits.set(path, (hits.get(path) ?? 0) + 1)
    if (path === '/missing.pdf') return new Response('gone', { status: 404 })
    if (path === '/recover.pdf' && fail) { fail = false; return new Response('gone', { status: 404 }) }
    if (path === '/redirect.pdf') return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private.pdf' } })
    if (path === '/html.pdf') return new Response('HTML', { headers: { 'Content-Type': 'text/html' } })
    if (path === '/fake.pdf') return new Response('fake', { headers: { 'Content-Type': 'application/pdf' } })
    if (path === '/big-header.pdf') return new Response(new Uint8Array(33 * 1024 * 1024), { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(33 * 1024 * 1024) } })
    if (path === '/slow.pdf') { await new Promise((resolve) => setTimeout(resolve, 21_000)); return new Response(samplePdf(), { headers: { 'Content-Type': 'application/pdf' } }) }
    if (path === '/big-stream.pdf') {
      let sent = 0
      return new Response(new ReadableStream({ pull(controller) { if (sent++ < 34) controller.enqueue(new Uint8Array(1024 * 1024)); else controller.close() } }), { headers: { 'Content-Type': 'application/pdf' } })
    }
    return new Response(samplePdf(), { headers: { 'Content-Type': 'application/pdf' } })
  } })
  const build = await Bun.build({ entrypoints: [new URL('./worker.ts', import.meta.url).pathname], target: 'browser', format: 'esm', minify: false })
  if (!build.success) throw new AggregateError(build.logs)
  const mf = new Miniflare({
    name: 'pdf-test', modules: true, script: await build.outputs[0]!.text(), compatibilityDate: '2026-07-28',
    d1Databases: ['DB'], durableObjects: { ORIGIN_PDF: { className: 'OriginPdfRelay', useSQLite: true } },
    outboundService: { node: async (req: IncomingMessage, res: ServerResponse) => {
      const path = new URL(req.url!, "https://city.fudoki.dev").pathname
      const response = await fetch(real && path.startsWith('/_res/') ? `https://www.city.musashino.lg.jp${path}` : `${upstream.url.origin}${path}`)
      const headers = Object.fromEntries(response.headers)
      if (headers['content-encoding']) { delete headers['content-encoding']; delete headers['content-length'] }
      res.writeHead(response.status, headers)
      if (response.body) for await (const part of response.body) res.write(part)
      res.end()
    } },
  })
  await mf.ready
  const db = await mf.getD1Database('DB')
  await db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8').replace(/^--.*$/gm, '').replaceAll('\n', ' '))
  for (const [name, table] of Object.entries(columns.tables)) {
    await db.exec(`CREATE TABLE ${name} (${table.columns.map((c) => `"${c.name}" ${c.type === 'string' ? 'TEXT' : 'REAL'}`).join(',')}, PRIMARY KEY (${table.primary_key}))`)
  }
  async function insert(table: keyof typeof columns.tables, row: Record<string, unknown>) {
    const data = Object.fromEntries(columns.tables[table].columns.filter((c) => ('nullable' in c && c.nullable === false)).map((c) => [c.name, c.type === 'string' ? 'x' : 1]))
    Object.assign(data, row)
    await db.prepare(`INSERT INTO ${table} (${Object.keys(data).join(',')}) VALUES (${Object.keys(data).map(() => '?').join(',')})`).bind(...Object.values(data) as never[]).run()
  }
  const paths = ['ok', 'missing', 'recover', 'redirect', 'html', 'fake', 'big-header', 'big-stream', 'slow', ...Array.from({ length: 18 }, (_, i) => `extra-${i}`)]
  for (const path of paths) await insert('origin', { origin_id: path, title: `試験原典 ${path}`, url: `https://city.fudoki.dev/${path}.pdf`, format: 'pdf' })
  await insert('origin', { origin_id: 'same', title: '同じ URL', url: 'https://city.fudoki.dev/ok.pdf', format: 'pdf' })
  await insert('origin', { origin_id: 'csv', title: 'CSV', url: 'https://city.fudoki.dev/csv', format: 'csv' })
  await insert('origin', { origin_id: 'private', title: 'private', url: 'http://127.0.0.1/pdf', format: 'pdf' })
  const scenarios = [
    { name: '枠あり', origin_id: 'ok', source_page: 1, source_x0: 35, source_y0: 40, source_x1: 240, source_y1: 80, amount_source_page: 1, amount_source_x0: 35, amount_source_y0: 140, amount_source_x1: 240, amount_source_y1: 180 },
    { name: '別頁の金額', origin_id: 'ok', source_page: 1, source_x0: 35, source_y0: 40, source_x1: 240, source_y1: 80, amount_source_page: 2, amount_source_x0: 35, amount_source_y0: 140, amount_source_x1: 240, amount_source_y1: 180 },
    { name: '枠欠損', origin_id: 'ok', source_page: 1, source_y0: 40, source_y1: 80 },
    { name: '次頁継続', origin_id: 'ok', source_page: 1, source_x0: 35, source_y0: 740, source_x1: 240, source_y1: 80 },
    { name: '取得失敗', origin_id: 'missing', source_page: 1, amount_source_page: 2 },
    { name: 'CSV原典', origin_id: 'csv', source_page: 8 },
    { name: '頁が変わった', origin_id: 'ok', source_page: 3 },
  ]
  for (const [i, row] of scenarios.entries()) await insert('settlement_expenditure_node', { jurisdiction_code: '000001', fiscal_year: 2024, account_name: '一般会計', kan_name: '総務費', node_kind: '目', axis: '科目', amount_yen: 12345, node_id: String(i + 1).padStart(64, '0'), ...row })
  if (real) {
    const response = await fetch('https://api.fudoki.dev/v1/expenditure/nodes:search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document_kind: 'settlement', fiscal_year: { min: 2025, max: 2025 }, where: { jurisdiction_code: { eq: ['132039'] } }, page_size: 2 }) })
    const data = await response.json() as { nodes: Record<string, unknown>[]; origins: Record<string, unknown>[] }
    for (const origin of data.origins) await insert('origin', origin)
    for (const { document_kind, ...node } of data.nodes) await insert('settlement_expenditure_node', node)
  }
  return {
    mf, hits, async reset() { await mf.dispatchFetch('http://localhost/__reset', { method: 'POST' }); hits.clear(); fail = true },
    async advance(ms: number) { await mf.dispatchFetch('http://localhost/__advance', { method: 'POST', body: String(ms) }) },
    async dispose() { await mf.dispose(); upstream.stop(true) },
  }
}
