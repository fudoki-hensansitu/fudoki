// 頁の末尾（ホームと紹介で共有）。風土記について・利用規約・プライバシーポリシーへはここから辿る
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Link } from './link'
import { FEEDBACK } from './feedback'

const DOCS = 'https://docs.fudoki.dev'

export function Footer() {
  const ext = 'inline-flex items-center gap-1 hover:text-foreground'
  return (
    <footer className="mt-auto flex pt-12 flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
      <span>© 2026 風土記</span>
      <span className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/about" className="hover:text-foreground">
          風土記について
        </Link>
        <a href={`${DOCS}/terms`} target="_blank" rel="noopener" className={ext}>
          利用規約
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
        <a href={`${DOCS}/privacy`} target="_blank" rel="noopener" className={ext}>
          プライバシーポリシー
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
        <a href={FEEDBACK} target="_blank" rel="noopener" className={ext}>
          フィードバック
          <ArrowSquareOutIcon aria-hidden="true" className="size-3" />
        </a>
        <a href="mailto:support@fudoki.dev" className="hover:text-foreground">
          お問い合わせ
        </a>
      </span>
    </footer>
  )
}

