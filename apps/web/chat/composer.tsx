import * as React from 'react'
import { ArrowRightIcon, ArrowUpIcon, SquareIcon } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** server/limits.ts の MAX_USER_TEXT と同じ。超えたら送れないことを先に見せる */
export const MAX_TEXT = 2000

/** 入口と会話の画面で共有する入力欄。Enter で送り、Shift+Enter と変換中の Enter は改行・確定にする（pill は1行なので改行しない） */
export function Composer({
  onSubmit,
  onStop,
  busy = false,
  pending = false,
  disabled = false,
  placeholder,
  autoFocus,
  compact = false,
  pill = false,
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
  /** 1行で始め、送るボタンを横に置く。会話の画面の続きの入力に使う */
  compact?: boolean
  /** 入口の hero に置く、大きな1行の入力。長い文は枠の中で横に流れる */
  pill?: boolean
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
  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault()
    submit()
  }
  if (pill)
    return (
      <form onSubmit={onSubmitForm}>
        {/* group の has-disabled は送るボタンの disabled にも効くので、空の間も枠と送るボタンを薄くしない */}
        <InputGroup
          data-disabled={disabled || undefined}
          className="h-14 rounded-full bg-background shadow-[var(--shadow-pill)] has-disabled:bg-background has-disabled:opacity-100 data-disabled:opacity-50 sm:h-18 dark:bg-card dark:has-disabled:bg-card"
        >
          <InputGroupInput
            aria-label="風土記の AI への質問"
            value={text}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            aria-invalid={over || undefined}
            enterKeyHint="send"
            className="h-full pl-5 text-base placeholder:text-muted-foreground/80 sm:pl-7 sm:text-xl md:text-xl"
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
            <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={!canSend} aria-label="送る" className="size-10 rounded-full disabled:opacity-100 sm:size-13 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-6">
              {pending ? <Spinner /> : <ArrowRightIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    )
  return (
    <form onSubmit={onSubmitForm}>
      <InputGroup data-disabled={disabled || undefined} className={compact ? 'flex-row! items-end' : undefined}>
        <InputGroupTextarea
          aria-label="風土記の AI への質問"
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={over || undefined}
          rows={compact ? 1 : 2}
          className={cn('max-h-48 min-h-14', compact && 'max-h-32 min-h-10')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <InputGroupAddon align="block-end" className={compact ? 'w-auto pr-1.5 pb-1 pl-0' : undefined}>
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
