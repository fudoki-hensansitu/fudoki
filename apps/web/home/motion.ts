// ホームのうちのまちの札の動きの長さ（ms）。receipt.tsx（段の切り替え）・machine3d.ts（立体の動き）・receipt.css（紙）で揃える。
// 読む間を置くため、どの段もゆっくり動かす（DESIGN.md の Motion）

/** 平らな札で予算と1人あたりを 0 から数え上げる */
export const COUNT_MS = 2000
/** 数え上げを読み終える間 */
export const READ_MS = 900
/** 平らな札が立体の機械になる */
export const MORPH_MS = 2200
/** 機械になってから紙を送り始めるまでの間 */
export const SETTLE_MS = 300
/** 紙を送る（receipt.css の rc-print と同じ） */
export const PRINT_MS = 3600
/** 頁を送る */
export const SCROLL_MS = 1400
