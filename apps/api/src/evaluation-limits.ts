// IP あたりの流量。429 の Retry-After に使う。cloudflare.config.ts の rate limit binding と同じ値で、evaluations.test.ts が照合する。
// config が import したファイルは cf dev（vite）の Worker から読めないので、config とは共有せず値を二重に持つ。
export const IP_RATE_LIMIT = { limit: 10, period: 60 } as const
