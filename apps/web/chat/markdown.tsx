// AI の答えの Markdown を React の要素に描く。HTML は組み立てず、生の HTML は文字のまま出す（XSS の経路を作らない）
import * as React from 'react'
import { marked, type Token, type Tokens } from 'marked'

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

function inline(tokens: Token[] | undefined): React.ReactNode[] {
  return (tokens ?? []).map((t, i) => {
    switch (t.type) {
      case 'strong':
        return <strong key={i} className="font-semibold">{inline((t as Tokens.Strong).tokens)}</strong>
      case 'em':
        return <em key={i}>{inline((t as Tokens.Em).tokens)}</em>
      case 'del':
        return <del key={i}>{inline((t as Tokens.Del).tokens)}</del>
      case 'codespan':
        return <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{(t as Tokens.Codespan).text}</code>
      case 'br':
        return <br key={i} />
      case 'link': {
        const link = t as Tokens.Link
        // http(s) 以外（javascript: など）はリンクにしない
        if (!/^https?:\/\//i.test(link.href)) return <React.Fragment key={i}>{inline(link.tokens)}</React.Fragment>
        return <a key={i} href={link.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{inline(link.tokens)}</a>
      }
      case 'text': {
        const text = t as Tokens.Text
        return <React.Fragment key={i}>{text.tokens ? inline(text.tokens) : text.text}</React.Fragment>
      }
      default:
        return <React.Fragment key={i}>{'raw' in t ? t.raw : ''}</React.Fragment>
    }
  })
}

function blocks(tokens: Token[]): React.ReactNode[] {
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'space':
        return null
      case 'paragraph':
        return <p key={i}>{inline((t as Tokens.Paragraph).tokens)}</p>
      case 'heading':
        return <h3 key={i} className="font-semibold">{inline((t as Tokens.Heading).tokens)}</h3>
      case 'list': {
        const list = t as Tokens.List
        const Tag = list.ordered ? 'ol' : 'ul'
        return (
          <Tag key={i} className={list.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>
            {list.items.map((item, j) => (
              <li key={j}>{blocks(item.tokens)}</li>
            ))}
          </Tag>
        )
      }
      case 'blockquote':
        return <blockquote key={i} className="border-l-2 pl-3 text-muted-foreground">{blocks((t as Tokens.Blockquote).tokens)}</blockquote>
      case 'code':
        return <pre key={i} className="overflow-x-auto rounded bg-muted p-3 text-[0.9em]"><code>{(t as Tokens.Code).text}</code></pre>
      case 'table': {
        const table = t as Tokens.Table
        const align = (a: 'left' | 'right' | 'center' | null) => ALIGN[a ?? 'left']
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {table.header.map((c, j) => (
                    <th key={j} className={`border-b px-2 py-1 font-medium ${align(c.align)}`}>{inline(c.tokens)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((c, j) => (
                      <td key={j} className={`border-b px-2 py-1 tabular-nums ${align(c.align)}`}>{inline(c.tokens)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      case 'hr':
        return <hr key={i} />
      case 'text':
        return <React.Fragment key={i}>{inline([t])}</React.Fragment>
      default:
        return <p key={i} className="whitespace-pre-wrap">{'raw' in t ? t.raw : ''}</p>
    }
  })
}

export const Markdown = React.memo(function Markdown({ text }: { text: string }) {
  const content = React.useMemo(() => blocks(marked.lexer(text, { gfm: true, breaks: true })), [text])
  return <div className="flex flex-col gap-2">{content}</div>
})
