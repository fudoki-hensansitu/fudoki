import * as React from 'react'
import { ArrowRightIcon, SquareIcon } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** server/limits.ts の MAX_USER_TEXT と同じ。超えたら送れないことを先に見せる */
export const MAX_TEXT = 2000

/** 入口と会話の画面で共有する、丸い1行の入力欄。Enter で送り（変換中の Enter は確定に使う）、長い文は枠の中で横に流れる */
export function Composer({
  onSubmit,
  onStop,
  busy = false,
  pending = false,
  disabled = false,
  placeholder,
  autoFocus,
  onFocus,
  compact = false,
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
  /** 入力欄に触れたとき */
  onFocus?: () => void
  /** 会話の画面の続きの入力向けの小さい大きさ（入口の hero は大きい） */
  compact?: boolean
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
  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault()
    submit()
  }
  return (
      <form onSubmit={onSubmitForm}>
        {/* group の has-disabled は送るボタンの disabled にも効くので、空の間も枠と送るボタンを薄くしない */}
        <InputGroup
          data-disabled={disabled || undefined}
          className={cn(
            'h-14 rounded-full bg-background shadow-[var(--shadow-pill)] has-disabled:bg-background has-disabled:opacity-100 data-disabled:opacity-50 dark:bg-card dark:has-disabled:bg-card',
            compact ? 'sm:h-14' : 'sm:h-18',
          )}
        >
          <InputGroupInput
            aria-label="風土記の AI への質問"
            value={text}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            aria-invalid={over || undefined}
            enterKeyHint="send"
            className={cn('h-full pl-5 text-base placeholder:text-muted-foreground/80', compact ? 'sm:pl-6' : 'sm:pl-7 sm:text-xl md:text-xl')}
            onFocus={onFocus}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // 変換中の Enter は確定に使う。Safari は確定の直後の Enter を keyCode 229 で送る
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (!e.nativeEvent.isComposing && e.keyCode !== 229) submit()
            }}
          />
          <InputGroupAddon align="inline-end" className="pr-2 sm:pr-3">
            {over ? <InputGroupText className="tabular-nums">{`${text.length} / ${MAX_TEXT}`}</InputGroupText> : null}
            {busy && onStop ? (
              <InputGroupButton type="button" variant="secondary" size="icon-sm" onClick={onStop} aria-label="止める" className="size-10 rounded-full">
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                disabled={!canSend}
                aria-label="送る"
                className={cn("size-10 rounded-full disabled:opacity-100 [&_svg:not([class*='size-'])]:size-5", !compact && "sm:size-13 sm:[&_svg:not([class*='size-'])]:size-6")}
              >
                {pending ? <Spinner /> : <ArrowRightIcon />}
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    )
}
