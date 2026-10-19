// 利用状況を Workers Analytics Engine に1要求1行で書く。会話の本文・IP・会話 ID は書かない。
// 列の並びは README の「利用状況」の SQL と合わせる。
import type { AnalyticsDataset } from './env'
import { logError } from './log'

export interface Usage {
  kind: 'chat' | 'relay'
  model: string
  inputTokens: number
  outputTokens: number
  /** tool の名前 → 呼んだ回数 */
  tools: Record<string, number>
  steps: number
  durationMs: number
  /** 失敗の種類。成功は空 */
  error: '' | 'model' | 'mcp' | 'aborted' | 'invalid'
}

export function writeUsage(dataset: AnalyticsDataset | undefined, u: Usage) {
  if (!dataset) return
  const names = Object.keys(u.tools).sort()
  const calls = names.reduce((n, k) => n + u.tools[k]!, 0)
  try {
    dataset.writeDataPoint({
      indexes: [u.model || u.kind],
      // blob1 種類・blob2 モデル・blob3 tool と回数（"name:count,..."）・blob4 失敗の種類
      blobs: [u.kind, u.model, names.map((k) => `${k}:${u.tools[k]}`).join(','), u.error],
      // double1 入力 token・double2 出力 token・double3 tool 呼び出し数・double4 段数・double5 所要 ms・double6 失敗なら1
      doubles: [u.inputTokens, u.outputTokens, calls, u.steps, u.durationMs, u.error ? 1 : 0],
    })
  } catch (e) {
    // 記録の失敗で応答を落とさない
    logError(e)
  }
}
