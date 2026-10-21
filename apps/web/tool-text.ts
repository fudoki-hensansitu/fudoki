// MCP の tool の結果のうち、AI に渡す text の整え方。server/chat.ts（AI へ）と chat/history.ts（ブラウザが履歴を送るとき）が同じ形にする。
// 検索の結果は1回で10万字を超え、render の結果もそれを写している。履歴に残ると毎回送り直され、body の上限と AI の待ち時間を食う。

/** 1つの tool の結果の text を AI に渡す上限（文字）。収録している団体の一覧（約2.2万字）が全部入る大きさ */
export const MAX_TOOL_TEXT = 24_000

const TRUNCATED = `\n…（結果が長いため先頭の ${MAX_TOOL_TEXT} 文字だけを渡しています。条件を絞る・page_size を小さくする・order_by で並べ替えるなどして取り直してください）`
/** 表とグラフは画面の View が描く。同じデータを AI にも渡す必要はない */
const RENDERED = '表とグラフを画面に出しました。'
/** 前の回の結果は送り直さない。AI は自分の前の答えの文章だけを手がかりにする */
export const OMITTED = '（前の回に取得した結果は省略しました。必要なら取り直してください）'

interface ToolOutput {
  content?: unknown
  isError?: boolean
}

/** 結果から text の部分だけを取り出し、描画 tool は短い定型にし、長いものは上限で切る。もう一度通しても同じ結果になる */
export function toolText(toolName: string, output: unknown): string {
  const { content, isError } = (output ?? {}) as ToolOutput
  const text = Array.isArray(content)
    ? content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text as string).join('\n')
    : ''
  if (!text) return '結果がありません'
  if (toolName === 'render_expenditure_view' && !isError) return RENDERED
  if (text.length <= MAX_TOOL_TEXT || text.endsWith(TRUNCATED)) return text
  return text.slice(0, MAX_TOOL_TEXT) + TRUNCATED
}
