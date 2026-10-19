import * as React from 'react'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** server/limits.ts の MAX_USER_TEXT と同じ。超えたら送れないことを先に見せる */
export const MAX_TEXT = 2000

/** 入口と会話の画面で共有する入力欄。Enter で送り、Shift+Enter と変換中の Enter は改行・確定にする */
export function Composer({
  onSubmit,
  onStop,
  busy = false,
  pending = false,
  disabled = false,
  placeholder,
  autoFocus,
  compact = false,
  children,
}: {
  /** false を返すか reject したら、送れなかったとして入力を戻す */
  onSubmit: (text: string) => void | boolean | Promise<void | boolean>
  onStop?: () => void
  /** 応答の生成中（止められる） */
  busy?: boolean
  /** 送信の準備中（会話を始める確認など） */
  pending?: boolean
  disabled?: boolean
  placeholder: string
  autoFocus?: boolean
  /** 狭い画面（sm 未満）では1行で始め、送るボタンを横に置く。会話の画面の続きの入力に使う */
  compact?: boolean
  children?: React.ReactNode
}) {
  const [text, setText] = React.useState('')
  const over = text.length > MAX_TEXT
  const canSend = !disabled && !busy && !pending && !over && text.trim().length > 0
  const submit = () => {
    if (!canSend) return
    const value = text.trim()
    setText('')
    // 送れなかったら質問を戻す。待つ間に新しく書き始めていたら、その下書きを残す
    const restore = () => setText((current) => (current === '' ? value : current))
    void Promise.resolve()
      .then(() => onSubmit(value))
      .then(
        (ok) => ok === false && restore(),
        restore,
      )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <InputGroup data-disabled={disabled || undefined} className={compact ? 'max-sm:flex-row! max-sm:items-end' : undefined}>
        <InputGroupTextarea
          aria-label="風土記の AI への質問"
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={over || undefined}
          rows={compact ? 1 : 2}
          className={cn('max-h-48 min-h-14', compact && 'max-sm:max-h-32 max-sm:min-h-10')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <InputGroupAddon align="block-end" className={compact ? 'max-sm:w-auto max-sm:pr-1.5 max-sm:pb-1 max-sm:pl-0' : undefined}>
          {children}
          <InputGroupText className="ml-auto tabular-nums">{over ? `${text.length} / ${MAX_TEXT} 文字` : ''}</InputGroupText>
          {busy && onStop ? (
            <InputGroupButton type="button" variant="secondary" size="icon-sm" onClick={onStop} aria-label="止める">
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={!canSend} aria-label="送る">
              {pending ? <Spinner /> : <ArrowUpIcon />}
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
