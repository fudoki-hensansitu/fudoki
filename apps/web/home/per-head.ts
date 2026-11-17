// ホームのレシートの1人あたり。画面（receipt.tsx）とシェアの OG 画像（server/og-receipt.ts）で同じ割り方にする

/** 分野ごとの1人あたり（円）。和が合計（total を人口で割って丸めた額）に合うよう、大きい端数から1円ずつ足す */
export function perHeadParts(fields: { yen: number }[], total: number, pop: number) {
  const sum = Math.round(total / pop)
  const raw = fields.map((f) => f.yen / pop)
  const parts = raw.map(Math.floor)
  const rest = sum - parts.reduce((a, b) => a + b, 0)
  raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, Math.max(0, rest))
    .forEach(([, i]) => parts[i]!++)
  return { sum, parts }
}
