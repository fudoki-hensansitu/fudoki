// ホームのうちのまちの札（レジに見立てる）の動きの長さ（ms）。receipt.tsx（段の切り替え・頁送り）・receipt.css（1人あたりの出・紙）で揃える。
// 読む間を置くため、どの段もゆっくり動かす（DESIGN.md の Motion）

/** 札で予算を 0 から数え上げる。1人あたりは予算を数え終えてから同じ長さで数える */
export const COUNT_MS = 1600
/** 数え上げを読み終えてから紙を送り始めるまでの間 */
export const READ_MS = 900
/** 紙を送る（receipt.css の rc-print と同じ）。頁もこの長さで紙を追って送る */
export const PRINT_MS = 3600
/** 札を画面に入れるために頁を送る */
export const SCROLL_MS = 1400
/** 刷り直すとき、前のレシートを差し出し口で切り離し、丸まりながら落とす。落ち終えてから数え直す */
export const FALL_MS = 1800
