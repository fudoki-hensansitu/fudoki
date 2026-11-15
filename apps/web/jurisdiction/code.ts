// 全国地方公共団体コード。先頭5桁に検査数字を足した6桁
/** 先頭5桁に検査数字を足す */
export const withCheckDigit = (five: string) => {
  const r = [...five].reduce((s, d, i) => s + Number(d) * (6 - i), 0) % 11
  return `${five}${r === 0 ? 1 : (11 - r) % 10}`
}
