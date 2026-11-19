// 自治体の頁の右上に出す「私のまち」の札。ホームで住んでいるまちに選んだまちの頁にだけ出し、押すと出るメニューから解除できる。
// 選んだまちはブラウザ（localStorage）にだけあるので、サーバーの HTML には出さず、描いたあとに出す
import { CaretDownIcon, HouseLineIcon, XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useMyTown } from '../home/towns'

export function MyTownBadge({ code }: { code: string }) {
  const { town, set } = useMyTown()
  if (town?.code !== code) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="secondary" size="lg" className="rounded-full px-3" />}>
        <HouseLineIcon className="size-4 text-primary" aria-hidden="true" />
        私のまち
        <CaretDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => set(null)} className="gap-2 [&_svg]:text-muted-foreground">
          <XIcon />
          私のまちを解除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
