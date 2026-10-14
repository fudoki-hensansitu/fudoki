// 評価の検索の回数を、全利用者の合計で UTC の分と日の固定の窓で数える Durable Object（docs/prd/evaluation-search/dd.md）。
// 上限の値は D1 の control から Worker が読んで渡す。ここは数えて、超えていれば拒むだけ。

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export interface QuotaLimits {
  perMinute: number
  perDay: number
}

export type QuotaResult = { ok: true } | { ok: false; window: 'minute' | 'day'; retryAfter: number }

/** 回数の確かめと加算。Worker は AI Search を呼ぶ前に必ず通す。 */
export interface SearchQuota {
  take(limits: QuotaLimits): Promise<QuotaResult>
}

export interface QuotaNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

interface Storage {
  get<T>(key: string): Promise<T | undefined>
  put(entries: Record<string, unknown>): Promise<void>
}
interface State {
  storage: Storage
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>
}
interface Counter { window: number; count: number }

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0

/** Durable Object の binding を SearchQuota に包む。読めない・書けない・応答が不正なときは例外にする（呼び出し側が 503 にする）。 */
export function quotaOf(namespace: QuotaNamespace | undefined): SearchQuota | undefined {
  if (!namespace) return undefined
  return {
    async take(limits) {
      const response = await namespace.get(namespace.idFromName('evaluation-search-v1')).fetch(
        new Request('https://quota.internal/take', { method: 'POST', body: JSON.stringify(limits) })
      )
      if (!response.ok) throw new Error(`回数の記録に失敗: ${response.status}`)
      const body = await response.json() as Partial<QuotaResult> & { ok?: unknown }
      if (body.ok === true) return { ok: true }
      if (body.ok === false && (body.window === 'minute' || body.window === 'day') && positive(body.retryAfter)) {
        return { ok: false, window: body.window, retryAfter: body.retryAfter }
      }
      throw new Error('回数の記録の応答が不正')
    },
  }
}

/** 確かめと加算は blockConcurrencyWhile の中で行い、storage に書いてから返す。拒んだ検索は数えない。 */
export class EvaluationSearchQuota {
  constructor(
    private readonly state: State,
    _env?: unknown,
    private readonly now: () => number = Date.now
  ) {}

  async fetch(request: Request): Promise<Response> {
    const limits = await request.json().catch(() => null) as Partial<QuotaLimits> | null
    if (!positive(limits?.perMinute) || !positive(limits?.perDay)) return Response.json({ error: '上限が不正です' }, { status: 400 })
    const { perMinute, perDay } = limits
    return this.state.blockConcurrencyWhile(async () => {
      const now = this.now()
      const [minuteWindow, dayWindow] = [Math.floor(now / MINUTE_MS), Math.floor(now / DAY_MS)]
      const stored = { minute: await this.state.storage.get<Counter>('minute'), day: await this.state.storage.get<Counter>('day') }
      const minute = stored.minute?.window === minuteWindow ? stored.minute : { window: minuteWindow, count: 0 }
      const day = stored.day?.window === dayWindow ? stored.day : { window: dayWindow, count: 0 }
      // 日の上限を先に見る（両方超えているときは待ちが長い日の方を伝える）
      if (day.count >= perDay) return Response.json({ ok: false, window: 'day', retryAfter: Math.ceil(((dayWindow + 1) * DAY_MS - now) / 1000) })
      if (minute.count >= perMinute) return Response.json({ ok: false, window: 'minute', retryAfter: Math.ceil(((minuteWindow + 1) * MINUTE_MS - now) / 1000) })
      await this.state.storage.put({ minute: { window: minuteWindow, count: minute.count + 1 }, day: { window: dayWindow, count: day.count + 1 } })
      return Response.json({ ok: true })
    })
  }
}
