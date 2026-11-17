import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// 見出し。大きさは4つだけにし、画面ごとにクラスを書かない（DESIGN.md の Typography）。
// h1 は頁の見出し、h2 は頁の中の節・タブの見出し、h3 は札・カードの見出し、headline は本文の大きさのまま太くした小さな見出し
const titleVariants = cva("font-semibold", {
  variants: {
    size: {
      h1: "text-[26px] leading-[1.35] tracking-[0.02em] sm:text-[32px]",
      h2: "text-xl leading-snug",
      h3: "text-[17px] leading-snug",
      headline: "text-base",
    },
  },
  defaultVariants: { size: "h2" },
})

const TAG = { h1: "h1", h2: "h2", h3: "h3", headline: "h4" } as const

type TitleProps = React.ComponentProps<"h2"> &
  VariantProps<typeof titleVariants> & {
    /** 要素。既定は大きさと同じ見出し（headline は h4）。見出しの順を保つために変えるときに渡す */
    as?: "h1" | "h2" | "h3" | "h4" | "p" | "div"
  }

function Title({ size, as, className, ...props }: TitleProps) {
  const Tag = as ?? TAG[size ?? "h2"]
  return <Tag data-slot="title" className={cn(titleVariants({ size }), className)} {...props} />
}

export { Title, titleVariants }
