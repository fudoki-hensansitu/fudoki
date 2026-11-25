// まち比べの頁に共通する枠。サイドバーは置かず、本文と、風土記の本体への入口だけ
import '../../compare/styles/app.css'
import { Footer } from '../../compare/components/compare-map'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      {children}
      <Footer />
    </div>
  )
}
