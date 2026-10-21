/** MCP の tool 結果の `_meta` で次の質問の候補を運ぶキー。MCP の予約接頭辞を避けた独自ドメイン接頭辞にする */
export const SUGGESTIONS_META_KEY = 'fudoki.dev/suggestions'

export const MAX_SUGGESTIONS = 3
const MAX_LABEL = 40
const MAX_PROMPT = 200

/** 次の質問の候補。押すと prompt がそのまま利用者の質問として送られる */
export interface Suggestion {
  label: string
  prompt: string
}

/** tool 結果の `_meta` から候補を取り出す。形が違うものは捨て、上限を超える分は切る */
export function readSuggestions(meta: unknown): Suggestion[] {
  const raw = (meta as Record<string, unknown> | null | undefined)?.[SUGGESTIONS_META_KEY]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is Suggestion => typeof s?.label === 'string' && typeof s?.prompt === 'string')
    .filter((s) => s.label.length > 0 && s.label.length <= MAX_LABEL && s.prompt.length > 0 && s.prompt.length <= MAX_PROMPT)
    .slice(0, MAX_SUGGESTIONS)
}
