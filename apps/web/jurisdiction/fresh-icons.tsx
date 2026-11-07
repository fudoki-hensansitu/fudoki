// 新しく始めたことの印。右が尖ったタグに、新規は「NEW」、拡大（今ある事業の中での取り組みも）は上向きの矢印と「UP」。
// 文字はフォントに頼らず線で描く（ページの書体によって幅が変わり、枠からはみ出したため）。色は currentColor
export const NewIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 22" aria-hidden="true" className={className}>
    <path d="M3 2H33L39 11L33 20H3a2.5 2.5 0 0 1-2.5-2.5V4.5A2.5 2.5 0 0 1 3 2Z" fill="currentColor"/><g fill="none" stroke="#fff" strokeWidth="2.37" strokeLinecap="round" strokeLinejoin="round"><path d="M0 10V0L6 10V0" transform="translate(8.46 7.00) scale(0.800)" /><path d="M5 0H0V10H5M0 5H4.2" transform="translate(14.54 7.00) scale(0.800)" /><path d="M0 0L2 10L4.2 3L6.4 10L8.4 0" transform="translate(19.82 7.00) scale(0.800)" /></g>
  </svg>
)

export const UpIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 22" aria-hidden="true" className={className}>
    <path d="M3 2H33L39 11L33 20H3a2.5 2.5 0 0 1-2.5-2.5V4.5A2.5 2.5 0 0 1 3 2Z" fill="currentColor"/><path d="M9 15V7M5.6 10.4L9 7L12.4 10.4" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/><g fill="none" stroke="#fff" strokeWidth="2.37" strokeLinecap="round" strokeLinejoin="round"><path d="M0 0V6.6A3 3 0 0 0 6 6.6V0" transform="translate(17.22 7.00) scale(0.800)" /><path d="M0 10V0H3A2.6 2.6 0 0 1 3 5.6H0" transform="translate(23.30 7.00) scale(0.800)" /></g>
  </svg>
)
