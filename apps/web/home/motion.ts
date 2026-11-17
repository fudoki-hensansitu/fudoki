// ホームのうちのまちの札とレシートプリンタの動きの長さ（ms）。receipt.tsx（段の切り替え・頁送り）・machine3d.ts（プリンタの動き）・receipt.css（紙）で揃える。
// 読む間を置くため、どの段もゆっくり動かす（DESIGN.md の Motion）

/** 札で予算を 0 から数え上げる。1人あたりは予算を数え終えてから同じ長さで数える */
export const COUNT_MS = 1600
/** 数え上げを読み終える間 */
export const READ_MS = 900
/** 札の下にレシートプリンタが現れる */
export const MORPH_MS = 2200
/** プリンタが据わってから紙を送り始めるまでの間 */
export const SETTLE_MS = 300
/** 紙を送る（receipt.css の rc-print と同じ）。頁もこの長さで紙を追って送る */
export const PRINT_MS = 3600
/** 札・プリンタを画面に入れるために頁を送る */
export const SCROLL_MS = 1400
