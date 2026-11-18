// ホームのうちのまちの札（レジに見立てる）の動きの長さ（ms）。receipt.tsx（段の切り替え・頁送り）・receipt.css（1人あたりの出・紙）で揃える。
// 読む間を置くため、どの段もゆっくり動かす（DESIGN.md の Motion）

/** 札で予算を 0 から数え上げる。1人あたりは予算を数え終えてから同じ長さで数える */
export const COUNT_MS = 1600
/** 札の見出しや金額が浮かび上がる */
export const IN_MS = 500
/** 予算が着地してから、1人あたりの見出しを出すまでの間 */
export const GAP_MS = 300
/** 札の4つ（予算の見出し → 予算の金額 → 1人あたりの見出し → 1人あたりの金額）を出し始める時刻と、出し終える時刻。
 * 同時に出すと目が追えないので、いつも一つだけを動かす（2026-11-18 yuito） */
export const BEAT = {
  label1: 0,
  amount1: IN_MS,
  label2: IN_MS + COUNT_MS + GAP_MS,
  amount2: IN_MS * 2 + COUNT_MS + GAP_MS,
  done: IN_MS * 2 + COUNT_MS * 2 + GAP_MS,
}
/** 数え上げを読み終えてから紙を送り始めるまでの間 */
export const READ_MS = 900
/** 紙を送る（receipt.css の rc-print と同じ）。頁もこの長さで紙を追って送る */
export const PRINT_MS = 3600
/** 札を画面に入れるために頁を送る */
export const SCROLL_MS = 1400
