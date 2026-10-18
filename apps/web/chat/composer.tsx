import * as React from 'react'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

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
  children,
}: {
  onSubmit: (text: string) => void | Promise<void>
  onStop?: () => void
  /** 応答の生成中（止められる） */
  busy?: boolean
  /** 送信の準備中（会話を始める確認など） */
  pending?: boolean
  disabled?: boolean
  placeholder: string
  autoFocus?: boolean
  children?: React.ReactNode
}) {
  const [text, setText] = React.useState('')
  const over = text.length > MAX_TEXT
  const canSend = !disabled && !busy && !pending && !over && text.trim().length > 0
  const submit = () => {
    if (!canSend) return
    const value = text.trim()
    setText('')
    void onSubmit(value)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <InputGroup data-disabled={disabled || undefined}>
        <InputGroupTextarea
          aria-label="風土記の AI への質問"
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={over || undefined}
          rows={2}
          className="max-h-48 min-h-14"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <InputGroupAddon align="block-end">
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
