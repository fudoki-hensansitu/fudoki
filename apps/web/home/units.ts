// 額を兆・億・万の単位で区切る。ホームの札（receipt.tsx）と、それを描くレシートの OG 画像（server/og-receipt.ts）で揃える

/** 額を兆・億・万の単位で区切った文字（9,606億8,000万円 の「円」の前まで）。0 の区切りは出さない。端数は丸めない */
export function withUnits(yen: number): string {
  const units = ['', '万', '億', '兆']
  let n = Math.max(0, Math.floor(yen))
  const parts: string[] = []
  for (let i = 0; n > 0 && i < units.length; i++) {
    const g = i === units.length - 1 ? n : n % 10000
    if (g) parts.unshift(`${g.toLocaleString('ja-JP')}${units[i]}`)
    n = i === units.length - 1 ? 0 : Math.floor(n / 10000)
  }
  return parts.join('') || '0'
}
