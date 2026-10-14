// IP あたりの流量。cloudflare.config.ts の rate limit binding と、429 の Retry-After が同じ値を使う。
export const IP_RATE_LIMIT = { limit: 10, period: 60 } as const
