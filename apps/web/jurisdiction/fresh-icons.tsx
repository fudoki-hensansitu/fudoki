// 新しく始めたことの印。New! はギザギザのシール、Up!（拡大・今ある事業の中での取り組み）は上向きの矢印。色は currentColor
export const NewIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <polygon points="16.00,0.50 18.58,3.05 21.93,1.68 23.33,5.02 26.96,5.04 26.98,8.67 30.32,10.07 28.95,13.42 31.50,16.00 28.95,18.58 30.32,21.93 26.98,23.33 26.96,26.96 23.33,26.98 21.93,30.32 18.58,28.95 16.00,31.50 13.42,28.95 10.07,30.32 8.67,26.98 5.04,26.96 5.02,23.33 1.68,21.93 3.05,18.58 0.50,16.00 3.05,13.42 1.68,10.07 5.02,8.67 5.04,5.04 8.67,5.02 10.07,1.68 13.42,3.05" fill="currentColor" />
    <text x="16" y="19.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#fff" letterSpacing="-.2">NEW</text>
  </svg>
)

export const UpIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <path d="M16 1.5 L29.5 15 H22 V29 a1.5 1.5 0 0 1 -1.5 1.5 H11.5 A1.5 1.5 0 0 1 10 29 V15 H2.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <text x="16" y="24" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff">UP</text>
  </svg>
)
