// 見せる tool の結果の組み立て。AI には content の text だけを渡し（toolText）、view は会話の画面だけが読む
import { toolText } from '../../tool-text'
import { View, type ViewResult } from '../../chat/views/schema'
import { logError } from '../log'

const text = (t: string) => [{ type: 'text' as const, text: t }]

/** 描けない（データが無い・読めない）ときの結果。AI には理由を渡し、画面は印だけを出す */
export const viewError = (message: string): ViewResult => ({ content: text(message), isError: true })

/** 返す前に形を確かめる。崩れた view を画面に送らない */
export function viewResult(message: string, view: View): ViewResult {
  const r = View.safeParse(view)
  if (!r.success) {
    logError(r.error)
    return viewError('部品のデータを組めませんでした。表や文で答えてください')
  }
  return { content: text(message), view: r.data }
}

/** AI に渡す側。view を AI に届けない（既定の変換は output 全体を渡す） */
export const toModelOutput = ({ output }: { output: unknown }) => ({ type: 'text' as const, value: toolText(output) })

/** 見せる tool に共通の、AI への添え書き */
export const SHOWN = '利用者の画面に部品を描きました。部品に出ている数字を文で繰り返さず、問いへの答えと要点だけを短く書いてください。'
