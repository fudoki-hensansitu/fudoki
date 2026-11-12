// AI エージェントが風土記の API・MCP を見つけるための入口。/.well-known の文書（routes/.well-known/）と、頁の応答の Link ヘッダー・Markdown の応答（middleware/01.site.ts）
import { MCP_URL } from './env'

const API_ORIGIN = 'https://api.fudoki.dev'
const OPENAPI_URL = `${API_ORIGIN}/openapi.json`
const DOCS_URL = 'https://docs.fudoki.dev/'
const OPENAPI_TYPE = 'application/vnd.oai.openapi+json'

/** RFC 9727 の API Catalog（/.well-known/api-catalog） */
export const API_CATALOG = {
  linkset: [
    {
      anchor: API_ORIGIN,
      'service-desc': [{ href: OPENAPI_URL, type: OPENAPI_TYPE }],
      'service-doc': [{ href: DOCS_URL, type: 'text/html' }],
    },
  ],
}
export const API_CATALOG_TYPE = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'

/**
 * MCP Server Card（/.well-known/mcp/server-card.json）。name・title・version・説明は apps/api の MCP が initialize で返す値（src/app.ts の mcpServer）と揃える。
 * name は Server Card の規約で reverse-DNS の `<namespace>/<name>`
 */
export const MCP_SERVER_CARD = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'dev.fudoki/fudoki-api',
  title: '風土記(fudoki)',
  version: '1.0.0',
  description: '風土記 provides read-only search of Japanese municipal expenditure budgets and settlements, project evaluation sheets, budget proposal press releases and projects followed across years.',
  websiteUrl: 'https://fudoki.dev/',
  repository: { url: 'https://github.com/fudoki-hensansitu/fudoki', source: 'github', subfolder: 'apps/api' },
  remotes: [{ type: 'streamable-http', url: MCP_URL }],
}

/** 頁の応答に付ける Link ヘッダー（RFC 8288） */
export const DISCOVERY_LINK = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  `<${OPENAPI_URL}>; rel="service-desc"; type="${OPENAPI_TYPE}"`,
  `<${DOCS_URL}>; rel="service-doc"`,
].join(', ')

/** Accept で text/markdown を text/html 以上に望んでいるか */
export function wantsMarkdown(accept: string | undefined): boolean {
  const q = (type: string) => {
    for (const part of (accept ?? '').split(',')) {
      const [media, ...params] = part.trim().toLowerCase().split(';')
      if (media?.trim() !== type) continue
      const value = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return value ? Number(value.slice(2)) || 0 : 1
    }
    return undefined
  }
  const markdown = q('text/markdown')
  if (!markdown) return false
  return markdown >= (q('text/html') ?? 0)
}

/** Workers AI の toMarkdown のうち使う部分 */
interface MarkdownConverter {
  toMarkdown(
    file: { name: string; blob: Blob },
    options?: { conversionOptions?: { html?: { hostname?: string; cssSelector?: string } } },
  ): Promise<{ format: string; data?: string; error?: string }>
}

/** 頁の HTML を Markdown にする。本文（main）があればそこだけ、無ければ頁全体。変換できなければ undefined */
export async function htmlToMarkdown(ai: unknown, html: string, url: string): Promise<string | undefined> {
  if (!ai) return undefined
  const cssSelector = /<main[\s>]/.test(html) ? 'main' : undefined
  const result = await (ai as MarkdownConverter).toMarkdown(
    { name: 'page.html', blob: new Blob([html], { type: 'text/html' }) },
    { conversionOptions: { html: { hostname: url, cssSelector } } },
  )
  return result.format === 'markdown' && result.data ? result.data : undefined
}
