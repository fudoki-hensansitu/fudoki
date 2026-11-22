// 頁の見出し「私のお金はどこへ行った？」。まちの頁では押すとトップ（まちを選ぶ）へ戻る
import { Link } from '@void/react'
import { Mark } from './mark'
import { Title } from './title'

export const TITLE = '私のお金はどこへ行った？'

export function Intro({ home = false }: { home?: boolean }) {
  const body = (
    <div className="flex items-center gap-3 sm:gap-4">
      <Mark className="size-9 shrink-0 text-primary sm:size-11" />
      <Title size="h1" as={home ? 'h1' : 'p'}>{TITLE}</Title>
    </div>
  )
  return <header className="ob-rise mb-7 sm:mb-8">{home ? body : <Link href="/" className="no-underline">{body}</Link>}</header>
}

/** 頁の下。このサイトが風土記のデータで作られていることと、本体への入口 */
export function Footer() {
  return (
    <footer className="mt-auto pt-16 text-sm text-muted-foreground">
      <a href="https://fudoki.dev/" className="inline-flex items-center gap-2 hover:text-foreground">
        <Mark className="size-5 text-primary" />
        風土記
      </a>
    </footer>
  )
}
