// 見せる tool の部品を会話の中に描く。部品は自治体の頁と同じものを使い、会話の中では drill せず「頁で開く」で頁へ移る。
// 会話の bundle を軽く保つため、conversation.tsx が lazy で読む（図・表を出した会話だけが読む）
import { ArrowRightIcon } from '@phosphor-icons/react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Title } from '@/components/ui/title'
import { Link } from '../../nav/link'
import { FinanceSections } from '../../jurisdiction/app/finance'
import { IncomeFlowBody } from '../../jurisdiction/app/income-flow'
import { Amt } from '../../jurisdiction/app/amount'
import { reiwa } from '../../jurisdiction/types'
import { readView, type ViewData } from './schema'

const DOC_LABEL = { initial: '当初予算', settlement: '決算' } as const

function OpenPage({ path }: { path: string }) {
  return (
    <Link href={path} className="inline-flex items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline">
      頁で開く
      <ArrowRightIcon aria-hidden="true" />
    </Link>
  )
}

function MoneyFlowView({ data }: { data: ViewData<'money_flow'> }) {
  return (
    <>
      <Title size="headline" as="h3">{`${data.name} ${reiwa(data.year)} ${DOC_LABEL[data.document_kind]}の${data.flow.words[0]}→${data.flow.words[1]}`}</Title>
      <div>
        <IncomeFlowBody data={data.flow} />
      </div>
      {data.path ? <OpenPage path={data.path} /> : null}
    </>
  )
}

function LocalFinanceView({ data }: { data: ViewData<'local_finance'> }) {
  const year = data.finance.at(-1)!.year
  return (
    <>
      <Title size="headline" as="h3">{`${data.name}の財政`}</Title>
      <div className="flex flex-col gap-6">
        <FinanceSections finance={data.finance} year={year} population={data.population} prefecture={data.prefecture} sections={data.sections} />
      </div>
      <OpenPage path={data.path} />
    </>
  )
}

function ExpenditureTableView({ data }: { data: ViewData<'expenditure_table'> }) {
  const subjects = data.table === 'subjects'
  const where = data.groups.some((g) => g.rows.some((r) => r.where))
  return (
    <>
      <Title size="headline" as="h3">{data.title}</Title>
      {data.groups.map((g, i) => (
        <section key={g.heading ?? i} className="flex flex-col gap-2">
          {g.heading ? <p className="text-sm text-muted-foreground">{g.heading}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                {where ? <TableHead>自治体・年度</TableHead> : null}
                {subjects ? <TableHead>段</TableHead> : null}
                <TableHead>名前</TableHead>
                <TableHead className="text-right">{data.amountLabel}</TableHead>
                <TableHead>出典</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.rows.map((r, j) => (
                <TableRow key={j}>
                  {where ? <TableCell className="whitespace-nowrap text-muted-foreground">{r.where}</TableCell> : null}
                  {subjects ? <TableCell className="whitespace-nowrap text-muted-foreground">{r.level}</TableCell> : null}
                  <TableCell className="min-w-48 whitespace-normal">
                    <span className="block">{r.name}</span>
                    {r.under || r.department ? <span className="block text-xs text-muted-foreground">{[r.under, r.department].filter(Boolean).join(' · ')}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{r.yen == null ? <span className="text-muted-foreground">金額なし</span> : <Amt yen={r.yen} />}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        資料
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
      {data.hasMore || data.groups.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          {data.hasMore ? '50件まで表示しています（続きがあります）。' : ''}
          {data.groups.length > 1 ? '分け方の違う表どうしは足せません。' : ''}
        </p>
      ) : null}
      {data.path ? <OpenPage path={data.path} /> : null}
    </>
  )
}

/** tool の結果に描ける部品があれば描く。無い・古い版の形なら何も出さない（印だけが残る） */
export default function ViewBlock({ output }: { output: unknown }) {
  const view = readView(output)
  if (!view) return null
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border bg-background p-4">
      {view.kind === 'money_flow' ? <MoneyFlowView data={view.data} /> : view.kind === 'local_finance' ? <LocalFinanceView data={view.data} /> : <ExpenditureTableView data={view.data} />}
    </div>
  )
}
