import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

const frame = document.querySelector<HTMLIFrameElement>('iframe')!
const rpc = async (method: string, params: unknown) => {
  const response = await fetch('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const text = await response.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text).result
}
const result = await rpc('tools/call', { name: 'search_expenditure_nodes', arguments: { document_kind: 'settlement', fiscal_year: { min: location.search.includes('real') ? 2025 : 2024, max: location.search.includes('real') ? 2025 : 2024 } } })
const listed = await rpc('resources/list', {})
const resource = (await rpc('resources/read', { uri: listed.resources[0].uri })).contents[0]
const domains = resource._meta.ui.csp.connectDomains.join(' ')
const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src ${domains}; worker-src 'none'`
const bridge = new AppBridge(null, { name: '風土記 試験host', version: '1' }, { openLinks: {}, serverTools: {}, logging: {} })
bridge.oncalltool = (params) => rpc('tools/call', params)
bridge.onopenlink = async ({ url }) => { document.getElementById('opened')!.textContent = url; return {} }
bridge.oninitialized = async () => { await bridge.sendToolResult(result) }
bridge.onsizechange = ({ height }) => { frame.style.height = `${height}px` }
const connected = bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!))
frame.srcdoc = resource.text.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)

await connected
