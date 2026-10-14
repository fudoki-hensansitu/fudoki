import {
  AppBridge,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge'
import { chartData, hierarchyIds, levelData, uiData } from './ui-fixture'
import type { McpUiStyles } from '@modelcontextprotocol/ext-apps'

const frame = document.querySelector<HTMLIFrameElement>('iframe')!
const rpc = async (method: string, params: unknown) => {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  const data = /^data: (.*)$/m.exec(text)
  return JSON.parse(data ? data[1]! : text).result
}
const scenario = new URLSearchParams(location.search).get('ui')
const preview = location.pathname === '/preview'
const year = location.search.includes('real') ? 2025 : 2024
const initialArgs = ['jurisdictions', 'single', 'empty-jurisdictions'].includes(
  scenario ?? '',
)
  ? { page_size: 1 }
  : {
      document_kind: 'settlement',
      fiscal_year: { min: year, max: year },
      page_size: scenario ? 1 : 100,
      ...(scenario === 'chart-kan' ? { where: { kan_name: { eq: ['総務費'] }, node_kind: { eq: ['項'] } } } : {}),
    }
const result = scenario
  ? undefined
  : await rpc('tools/call', {
      name: 'search_expenditure_nodes',
      arguments: initialArgs,
    })
const listed = await rpc('resources/list', {})
const resource = (await rpc('resources/read', { uri: listed.resources[0].uri }))
  .contents[0]
if (preview) resource.text = await (await fetch('/preview-view')).text()
const domains = resource._meta.ui.csp.connectDomains.join(' ')
const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src ${domains}; worker-src 'none'`
const bridge = new AppBridge(
  null,
  { name: '風土記 試験host', version: '1' },
  { openLinks: {}, serverTools: {}, logging: {}, updateModelContext: { text: {} }, message: { text: {} } },
  { hostContext: { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } },
)
const contexts: string[] = []
const messages: string[] = []
bridge.onmessage = async ({ content }) => {
  messages.push(content.map((c) => ('text' in c ? c.text : '')).join(''))
  document.getElementById('opened')!.textContent = `チャットに送信: ${messages.at(-1)}`
  return {}
}
let displayMode = 'inline'
bridge.onupdatemodelcontext = async ({ content }) => {
  contexts.push(content?.map((c) => ('text' in c ? c.text : '')).join('') ?? '')
  return {}
}
bridge.onrequestdisplaymode = async ({ mode }) => {
  displayMode = mode
  bridge.setHostContext({ displayMode: mode, availableDisplayModes: ['inline', 'fullscreen'] })
  return { mode }
}
const calls: { name: string; arguments?: unknown }[] = []
let release: (() => void) | undefined
let failures = 0
const toolResult = (data: unknown) => ({
  content: [],
  structuredContent: data,
  _meta: { apiOrigin: location.origin, jurisdictionNames: { '000001': '試験市', '000002': '未収録町', '000003': '比較市' } },
})
bridge.oncalltool = async (params) => {
  if (!scenario) return rpc('tools/call', params)
  calls.push(params)
  const input = params.arguments ?? {}
  if (scenario === 'pdf-locations' && params.name === 'get_expenditure_node') {
    const data = uiData(scenario)
    if ('nodes' in data) return toolResult({ node: data.nodes.find((n) => n.node_id === input.node_id), children: {}, origins: data.origins })
  }
  // 経路の款・項は名前で検索して開くので、どの場面でも試験の階層から答える
  const level = params.name === 'search_expenditure_nodes' && input.where ? levelData(input.where as Record<string, { eq?: unknown[] }>) : undefined
  if (level) return toolResult(level)
  if (params.name === 'get_expenditure_node' && hierarchyIds.has(String(input.node_id)))
    return toolResult(chartData('chart', String(input.node_id)))
  // 団体一覧のチップから款の一覧を開き、そのまま掘り下げられるようにする
  if ((scenario === 'jurisdictions' || scenario === 'single') && params.name !== 'list_jurisdictions')
    return toolResult(chartData('chart', params.name === 'get_expenditure_node' ? String(input.node_id) : undefined))
  if (scenario.startsWith('chart')) return toolResult(uiData(scenario, !!input.page_token, params.name === 'get_expenditure_node' ? String(input.node_id) : undefined))
  if (scenario === 'slow' || scenario === 'race')
    await new Promise<void>((resolve) => {
      release = resolve
    })
  if (scenario === 'retry' && failures++ === 0)
    return {
      isError: true,
      content: [{ type: 'text', text: '試験の取得失敗' }],
    }
  return toolResult(
    uiData(
      params.name === 'get_expenditure_node'
        ? input.node_id === 'ui-child'
          ? 'leaf'
          : 'detail'
        : scenario,
      !!input.page_token,
    ),
  )
}
// 試験host側から通常のbridge通知を送り、遅い応答とテーマ更新を検査する。
const qa = {
  calls: () => calls,
  contexts: () => contexts,
  messages: () => messages,
  displayMode: () => displayMode,
  release: () => {
    release?.()
    release = undefined
  },
  send: async (name: string) => {
    await bridge.sendToolInput({
      arguments: {
        document_kind: 'settlement',
        fiscal_year: { min: 2024, max: 2024 },
        page_size: 1,
      },
    })
    await bridge.sendToolResult(toolResult(uiData(name)))
  },
  theme: (theme: 'light' | 'dark', host: 'chatgpt' | 'claude') =>
    bridge.setHostContext({
      theme,
      displayMode: displayMode as 'inline' | 'fullscreen',
      availableDisplayModes: ['inline', 'fullscreen'],
      styles: {
        variables: (host === 'chatgpt'
          ? {
              '--color-background-primary':
                theme === 'dark' ? '#212121' : '#ffffff',
              '--color-text-primary': theme === 'dark' ? '#ececec' : '#0d0d0d',
              '--font-sans': 'Arial, sans-serif',
            }
          : {
              '--color-background-primary':
                theme === 'dark' ? '#262624' : '#faf9f5',
              '--color-text-primary': theme === 'dark' ? '#faf9f5' : '#141413',
              '--font-sans': 'Georgia, serif',
            }) as McpUiStyles,
      },
    }),
  teardown: () => bridge.teardownResource({}),
}
Object.assign(window, { uiQA: qa })
bridge.onopenlink = async ({ url }) => {
  document.getElementById('opened')!.textContent = url
  return {}
}
bridge.oninitialized = async () => {
  await bridge.sendToolInput({
    arguments: initialArgs,
  })
  if (scenario === 'loading') return
  await bridge.sendToolResult(
    scenario === 'error'
      ? {
          isError: true,
          content: [{ type: 'text', text: '試験の初回取得失敗' }],
        }
      : scenario
        ? toolResult(uiData(scenario))
        : result,
  )
}
bridge.onsizechange = ({ height }) => {
  frame.style.height = `${height}px`
}
const connected = bridge.connect(
  new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
)
frame.srcdoc = resource.text.replace(
  '<head>',
  `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
)

await connected

if (preview) {
  const theme = document.querySelector<HTMLSelectElement>('#preview-theme')!
  const width = document.querySelector<HTMLSelectElement>('#preview-width')!
  const params = new URLSearchParams(location.search)
  theme.value = [...theme.options].some(
    (option) => option.value === params.get('theme'),
  )
    ? params.get('theme')!
    : 'chatgpt-light'
  width.value = [...width.options].some(
    (option) => option.value === params.get('width'),
  )
    ? params.get('width')!
    : 'full'
  function update() {
    const [host, mode] = theme.value.split('-') as [
      'chatgpt' | 'claude',
      'light' | 'dark',
    ]
    qa.theme(mode, host)
    document.documentElement.style.colorScheme = mode
    document.getElementById('frame-wrap')!.style.width =
      width.value === 'full' ? '100%' : `${width.value}px`
    const url = new URL(location.href)
    url.searchParams.set('theme', theme.value)
    url.searchParams.set('width', width.value)
    history.replaceState(null, '', url)
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      '[data-pattern]',
    )) {
      const target = new URL(url)
      target.searchParams.set('ui', link.dataset.pattern!)
      link.href = target.href
      if (link.dataset.pattern === (scenario ?? 'jurisdictions'))
        link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    }
  }
  theme.onchange = update
  width.onchange = update
  update()
  document.getElementById('preview-reset')!.onclick = async () => {
    release?.()
    await fetch('/__release-pdf', { method: 'POST' })
    await fetch('/__reset', { method: 'POST' })
    location.reload()
  }
  const releaseButton = document.getElementById('preview-release')!
  releaseButton.hidden = !!scenario && !['race', 'slow'].includes(scenario)
  releaseButton.onclick = () => {
    qa.release()
    void fetch('/__release-pdf', { method: 'POST' })
  }
  const resultButton = document.getElementById('preview-result')!
  resultButton.hidden = !['race', 'slow', 'loading'].includes(scenario ?? '')
  resultButton.onclick = async () => {
    await bridge.sendToolInput({
      arguments: {
        document_kind: 'settlement',
        fiscal_year: { min: 2024, max: 2024 },
      },
    })
    await bridge.sendToolResult(toolResult(uiData('empty')))
  }
  const events = new EventSource('/preview-events')
  events.onmessage = () => location.reload()
  window.addEventListener('pagehide', () => events.close(), { once: true })
}
