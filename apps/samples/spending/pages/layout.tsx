// 全頁に共通する枠。サイドバーは置かず、1列の本文だけ
import '../styles/app.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col px-4 pt-10 pb-12 sm:px-8 sm:pt-14">{children}</main>
}
