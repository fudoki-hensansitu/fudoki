// 風土記のロゴ。ヘッダー・紹介・ホームのオンボーディング・自治体の頁が使う
import { LOGO_G, LOGO_WIDTH } from '../logo'

export const Logo = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${LOGO_WIDTH} 40`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
)

/** ロゴの左のマークだけ（LOGO_G の左端、y=4 から 32×32 を切り出す） */
export const Mark = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 4 32 32" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_G }} />
)
