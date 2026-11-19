// どのまちでも作れる「気になる」の問い（余ったお金・無駄・増えた事業・新しい事業・選挙・予算の決め方）を、本番の D1 の数字から型どおりに書き、
// jurisdiction/questions/generic/<自治体コード>.ts に置く。AI は使わない（数字を差し込むだけで文になり、費用も出ない）。
// 品川区のように問いを個別に書いた自治体（questions/index.ts の FEEDS）は作らない。
// 読むのは SELECT だけ。CLOUDFLARE_API_TOKEN（D1 の読み取り）と CLOUDFLARE_ACCOUNT_ID（mise.toml）が要る:
//   bun apps/web/scripts/generic-questions.ts
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import registry from '../../../packages/jurisdictions/jurisdictions.json'
import { jurisdictionPath } from '../jurisdiction/path'
import { formatYen, reiwa } from '../jurisdiction/types'
import type { Question, QuestionFeed } from '../jurisdiction/questions/types'

const API_DB = 'b9b6f209-083e-45b3-a896-1014a17a15f9'
const WEB_DB = '760c7476-6e46-4b44-b174-1bfdd1b4f957'
const OUT = join(import.meta.dir, '../jurisdiction/questions/generic')
/** 問いを個別に書いた自治体 */
const SKIP = new Set(['131091'])

const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
if (!account || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID と CLOUDFLARE_API_TOKEN が要ります')

async function query<T>(db: string, sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    })
    const body = (await res.json()) as { success: boolean; result?: { results: T[] }[]; errors?: { message: string }[] }
    if (body.success && body.result) return body.result[0]!.results
    // D1 は短い間に重い読みが続くと断る。少し待って読み直す
    if (attempt < 5) {
      await Bun.sleep(2000 * (attempt + 1))
      continue
    }
    throw new Error(`D1: ${body.errors?.map((e) => e.message).join(', ')}`)
  }
}

type Doc = { expenditure_id: string; fiscal_year: number; document_kind: 'initial' | 'settlement'; total_yen: number }
type Row = { project_id: string; name: string; yen: number }

const NAMES = registry.jurisdictions as Record<string, { name: string }>

/** 自治体の種類で変わる言葉（区長・区議会・区民） */
function words(code: string, name: string) {
  if (code.slice(2, 5) === '000') {
    const k = name.endsWith('都') ? '都' : name.endsWith('道') ? '道' : name.endsWith('府') ? '府' : '県'
    return { k, head: '知事', council: `${k}議会`, people: `${k}民` }
  }
  const k = name.endsWith('区') ? '区' : name.endsWith('町') ? '町' : name.endsWith('村') ? '村' : '市'
  return { k, head: `${k}長`, council: `${k}議会`, people: `${k}民` }
}

const pct = (n: number) => `${Math.round(n * 100)}%`
/** 9までは「6つ」、それより多いと「17件」 */
const count = (n: number) => (n < 10 ? `${n}つ` : `${n}件`)

async function build(code: string): Promise<QuestionFeed | null> {
  const name = NAMES[code]?.name
  if (!name) return null
  const w = words(code, name)
  const path = jurisdictionPath(code)
  const link = (r: { project_id: string; name: string }) => `[${r.name}](${path}/projects/${r.project_id})`

  const docs = await query<Doc>(
    API_DB,
    "SELECT expenditure_id, fiscal_year, document_kind, total_yen FROM expenditure WHERE jurisdiction_code = ? AND account_kind = '一般会計' AND amendment_number IS NULL AND document_kind IN ('initial','settlement')",
    [code],
  )
  const initial = new Map(docs.filter((d) => d.document_kind === 'initial').map((d) => [d.fiscal_year, d]))
  const settlement = new Map(docs.filter((d) => d.document_kind === 'settlement').map((d) => [d.fiscal_year, d]))
  if (!initial.size && !settlement.size) return null
  const yi = initial.size ? Math.max(...initial.keys()) : undefined
  const both = [...settlement.keys()].filter((y) => initial.has(y))
  const ys = both.length ? Math.max(...both) : undefined
  const questions: Question[] = []

  // 予算と決算の差（総額と、使われなかった割合の大きい事業）
  if (ys !== undefined) {
    const ini = initial.get(ys)!.total_yen
    const st = settlement.get(ys)!.total_yen
    const diff = ini - st
    questions.push({
      id: 'left',
      q: '使い切れずに余ったお金はある？',
      big: { value: formatYen(st), note: `${reiwa(ys)}に使ったお金（当初予算 ${formatYen(ini)}）` },
      answer:
        `${reiwa(ys)}の一般会計では、当初予算 **${formatYen(ini)}** に対して、決算で使ったのは **${formatYen(st)}** でした。` +
        (diff > 0
          ? `当初予算より ${formatYen(diff)} 少なく使っています。\n\n`
          : `年度の途中の補正予算で予算が増え、当初予算より ${formatYen(-diff)} 多く使っています。\n\n`) +
        '使い切れずに余ったお金（不用額）は、補正後の予算と決算の差で、余りは翌年度の収入（繰越金）になります。ここでは当初予算と比べているので、補正で増えた分は差に入っていません。',
      source: `${reiwa(ys)} 当初予算書・決算書（一般会計）`,
      follow: ['muda', 'どの事業で予算が余った？'],
    })

    // 決算の内訳が事業に結びついていない年度もあるので、新しい年度から順に、差の大きい事業が見つかるまで遡る
    let top: { project_id: string; name: string; ini: number; st: number }[] = []
    let ym = ys
    for (const y of both.sort((x, z) => z - x).slice(0, 3)) {
      const rows = await query<{ project_id: string; name: string; ini: number; st: number }>(
        API_DB,
        // 本番の D1 を読むので、資料の内訳（expenditure_id の索引）から事業へ辿る順に固める（事業の表から辿ると数十万行を読む）
        `SELECT py.project_id, di.name, di.amount_yen AS ini, ds.amount_yen AS st
         FROM expenditure_detail di CROSS JOIN project_year py ON py.initial_expenditure_detail_id = di.detail_id
         CROSS JOIN expenditure_detail ds ON ds.detail_id = py.settlement_expenditure_detail_id
         CROSS JOIN project p ON p.project_id = py.project_id
         WHERE di.expenditure_id = ? AND ds.expenditure_id = ? AND p.parent_project_id IS NULL AND di.amount_yen >= 100000000 AND ds.amount_yen < di.amount_yen * 0.8`,
        [initial.get(y)!.expenditure_id, settlement.get(y)!.expenditure_id],
      )
      top = rows.sort((a, b) => b.ini - b.st - (a.ini - a.st)).slice(0, 3)
      ym = y
      if (top.length) break
    }
    if (top.length) {
      const first = top[0]!
      questions.push({
        id: 'muda',
        q: '無駄がありそうな出費は？',
        big: { value: pct(1 - first.st / first.ini), note: `予算のうち使われなかった割合（${first.name}）` },
        answer:
          `無駄かどうかは資料からは決められませんが、手がかりの一つは「予算を立てたのに使われなかったお金」です。${reiwa(ym)}で、当初予算と決算の差が大きかった事業は次のとおりです。\n\n` +
          top.map((r) => `- ${link(r)} ${pct(1 - r.st / r.ini)}が使われず（当初予算 ${formatYen(r.ini)} → 決算 ${formatYen(r.st)}）`).join('\n') +
          '\n\n使われなかった理由は、工事の遅れ、申し込みが見込みより少ない、入札で安くなったなどさまざまで、予算書・決算書の数字だけではわかりません。',
        source: `${reiwa(ym)} 当初予算書・決算書（一般会計）`,
        follow: ['left', '使われなかった理由はどこで確かめられる？'],
      })
    }
  }

  // 増えた事業と、新しく始まった事業（当初予算どうし）
  if (yi !== undefined) {
    const amounts = (year: number) =>
      query<Row>(
        API_DB,
        `SELECT py.project_id, d.name, d.amount_yen AS yen FROM expenditure_detail d
         CROSS JOIN project_year py ON py.initial_expenditure_detail_id = d.detail_id
         CROSS JOIN project p ON p.project_id = py.project_id
         WHERE d.expenditure_id = ? AND p.parent_project_id IS NULL`,
        [initial.get(year)!.expenditure_id],
      )
    const now = await amounts(yi)
    // 「ここ数年」は3年前まで。3年前の予算書が無ければ収録のある最も古い年度
    const y0 = [...initial.keys()].filter((y) => y < yi && y >= yi - 3).sort()[0]
    if (y0 !== undefined && now.length) {
      const before = new Map((await amounts(y0)).map((r) => [r.project_id, r.yen]))
      const grown = now
        // 前の額が1,000万円に届かない事業は、科目の付け替えで額が移っただけのことがあるので外す
        .filter((r) => (before.get(r.project_id) ?? 0) >= 10_000_000 && r.yen > before.get(r.project_id)!)
        .map((r) => ({ ...r, from: before.get(r.project_id)!, up: r.yen - before.get(r.project_id)! }))
        .sort((a, b) => b.up - a.up)
        .slice(0, 3)
      if (grown.length) {
        const g = grown[0]!
        questions.push({
          id: 'grow',
          q: 'ここ数年で、いちばん増えた事業は？',
          big: { value: `+${formatYen(g.up)}`, note: `${g.name}（${reiwa(y0)} → ${reiwa(yi)}）` },
          answer:
            `${reiwa(y0)}と${reiwa(yi)}の当初予算を比べると、いちばん増えたのは ${link(g)} で、${formatYen(g.from)} から **${formatYen(g.yen)}** になりました。増えた額の大きい順に3つです。\n\n` +
            grown.map((r) => `- ${link(r)} ${formatYen(r.from)} → ${formatYen(r.yen)}（+${formatYen(r.up)}）`).join('\n') +
            '\n\n増えた理由は予算書の数字だけではわかりません。工事の時期が重なった、制度が変わったなどが考えられます。',
          source: `${reiwa(y0)}・${reiwa(yi)} 当初予算書（一般会計）`,
          follow: ['new', `${g.name}はなぜ増えた？`],
        })
      }
      // 前の年度の予算書があるときだけ、前の年度に無かった事業を新しい事業とみなす
      if (initial.has(yi - 1)) {
        const prev = new Set((await amounts(yi - 1)).map((r) => r.project_id))
        const fresh = now.filter((r) => !prev.has(r.project_id) && r.yen > 0).sort((a, b) => b.yen - a.yen)
        if (fresh.length) {
          const shown = fresh.slice(0, 6)
          questions.push({
            id: 'new',
            q: '新しく始まった事業は？',
            big: { value: count(fresh.length), note: '新しく予算書に載った事業' },
            answer:
              `${reiwa(yi)}の予算書には、前の年度に無かった事業が**${count(fresh.length)}**載りました。${fresh.length > shown.length ? '金額の大きい順に6つです。' : ''}\n\n` +
              shown.map((r) => `- ${link(r)} ${formatYen(r.yen)}`).join('\n') +
              '\n\n前の年度の事業の名前が変わったものも、新しい事業として数えていることがあります。',
            source: `${reiwa(yi - 1)}・${reiwa(yi)} 当初予算書（一般会計）`,
            follow: ['grow', `${shown[0]!.name}では何をする？`],
          })
        }
      }
    }

    // 選挙費（項。項の無い資料は目）
    const subjects = await query<{ subject_id: string; level: string; name: string; amount_yen: number; parent_subject_id: string | null }>(
      API_DB,
      "SELECT subject_id, level, name, amount_yen, parent_subject_id FROM expenditure_subject WHERE expenditure_id = ? AND name LIKE '%選挙%'",
      [initial.get(yi)!.expenditure_id],
    )
    const kou = subjects.filter((s) => s.level === '項' && s.name === '選挙費')
    const head = kou.length ? kou : subjects.filter((s) => s.level === '目' && s.name.endsWith('選挙費') && !subjects.some((k) => k.subject_id === s.parent_subject_id))
    const total = head.reduce((n, s) => n + s.amount_yen, 0)
    if (total > 0) {
      const heads = new Set(head.map((s) => s.subject_id))
      const moku = subjects.filter((s) => s.level === '目' && s.parent_subject_id && heads.has(s.parent_subject_id) && s.amount_yen > 0)
      const people = (
        await query<{ population: number }>(WEB_DB, 'SELECT population FROM population WHERE jurisdiction_code = ? ORDER BY reference_date DESC LIMIT 1', [code])
      )[0]?.population
      const perHead = people ? Math.round(total / people / 10) * 10 : undefined
      // 目ごとの事業（内訳の一段目）
      const items = moku.length
        ? await query<Row>(
            API_DB,
            `SELECT py.project_id, d.name, d.amount_yen AS yen FROM expenditure_detail d CROSS JOIN project_year py ON py.initial_expenditure_detail_id = d.detail_id
             WHERE d.subject_id IN (SELECT value FROM json_each(?)) AND d.depth = 1 AND d.breakdown = '事業' ORDER BY d.amount_yen DESC LIMIT 5`,
            [JSON.stringify(moku.map((m) => m.subject_id))],
          )
        : []
      questions.push({
        id: 'senkyo',
        field: 'gyosei',
        q: '選挙に、いくら？',
        big: { value: formatYen(total), note: perHead ? `${w.people}1人あたり 約${perHead.toLocaleString('ja-JP')}円` : `${reiwa(yi)}の当初予算の選挙費` },
        answer:
          `${reiwa(yi)}の当初予算の選挙費は **${formatYen(total)}** です。` +
          (perHead ? `${w.people}1人あたりにすると**約${perHead.toLocaleString('ja-JP')}円**です。` : '') +
          '選挙費には、選挙管理委員会の運営と、その年に行う選挙の費用が入ります。選挙の無い年は少なく、選挙のある年は多くなります。' +
          (items.length
            ? `\n\n主な中身は次のとおりです。\n\n${items.filter((r) => r.yen > 0).map((r) => `- ${link(r)} ${formatYen(r.yen)}`).join('\n')}`
            : moku.length
              ? `\n\n${moku.map((m) => `- ${m.name} ${formatYen(m.amount_yen)}`).join('\n')}`
              : ''),
        source: `${reiwa(yi)} 当初予算書（一般会計・選挙費）`,
        follow: ['yosan', '投票率はどのくらい？'],
      })
    }
  }

  // 予算の決め方（説明だけ。数字は総額を1つ添える）
  const latest = yi !== undefined ? initial.get(yi)! : undefined
  questions.push({
    id: 'yosan',
    q: '予算って、誰がどうやって決めるの？',
    answer:
      `${w.k}の予算は、**${w.head}が案をつくり、${w.council}が審議して議決する**と決まります。年度は4月から翌年の3月までです。\n\n` +
      `年度の途中で足りなくなったり、新しい支出が要ったりしたときは補正予算を組み、これも${w.council}の議決が要ります。使った結果は決算にまとめ、監査委員の審査を受けたあと${w.council}が認定します。` +
      (latest ? `${name}の${reiwa(latest.fiscal_year)}の一般会計の当初予算は ${formatYen(latest.total_yen)} です。` : ''),
    source: latest ? `地方自治法の定めと、${name}の${reiwa(latest.fiscal_year)} 当初予算書` : '地方自治法の定め',
    follow: ['left', `${w.council}ではどんな議論があった？`],
  })

  const ids = new Set(questions.map((q) => q.id))
  for (const q of questions) q.follow = q.follow.filter((f) => !/^[a-z]+$/.test(f) || ids.has(f))
  const order = ['muda', 'left', 'grow', 'new', 'senkyo', 'yosan'].filter((id) => ids.has(id))
  return { order, questions }
}

const codes = (
  await query<{ jurisdiction_code: string }>(API_DB, "SELECT DISTINCT jurisdiction_code FROM expenditure WHERE account_kind = '一般会計'")
)
  .map((r) => r.jurisdiction_code)
  .filter((c) => !SKIP.has(c))
  .sort()

mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) if (/^\d{6}\.ts$/.test(f)) rmSync(join(OUT, f))
const made: string[] = []
for (const code of codes) {
  const feed = await build(code)
  if (!feed) continue
  writeFileSync(
    join(OUT, `${code}.ts`),
    `// ${NAMES[code]!.name}の「気になる」の問い。scripts/generic-questions.ts が本番の数字から型どおりに書いた（手で直さない）\nimport type { QuestionFeed } from '../types'\n\nexport const feed: QuestionFeed = ${JSON.stringify(feed, null, 2)}\n`,
  )
  made.push(code)
  // 本番の D1 を読み続けて頁の読みを邪魔しないよう、自治体ごとに間を置く
  await Bun.sleep(1500)
  console.log(code, NAMES[code]!.name, feed.order.join(','))
}
writeFileSync(
  join(OUT, 'index.ts'),
  `// scripts/generic-questions.ts が書いた、どのまちでも作れる問いの一覧（手で直さない）\nimport type { QuestionFeed } from '../types'\n\nexport const GENERIC: Record<string, () => Promise<QuestionFeed>> = {\n${made.map((c) => `  '${c}': () => import('./${c}').then((m) => m.feed),`).join('\n')}\n}\n`,
)
