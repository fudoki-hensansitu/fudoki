// show_expenditure_table: 科目・内訳の検索（search_expenditure_subjects・search_expenditure_details）を引き直し、結果を表で会話に描く。
// AI が行を書き写さず、同じ引数で server が引いた行をそのまま並べる。続きは AI が page_token を渡して呼び直す
import { dynamicTool, jsonSchema } from 'ai'
import registry from '../../../../packages/jurisdictions/jurisdictions.json'
import type { ViewData } from '../../chat/views/schema'
import { jurisdictionPath } from '../../jurisdiction/path'
import { reiwa } from '../../jurisdiction/types'
import type { Env } from '../env'
import { apiCall, FudokiApiError, type WebOpInput, type WebOpOutput } from '../fudoki-api'
import { logError } from '../log'
import { toModelOutput, viewError, viewResult } from './result'

export const SHOW_EXPENDITURE_TABLE_TOOL = 'show_expenditure_table'

/** 会話の幅で読める行数。続きは page_token で */
const MAX_ROWS = 50

const NAMES = registry.jurisdictions as Record<string, { name?: string }>

const DESCRIPTION =
  '科目（search_expenditure_subjects）か内訳（search_expenditure_details）の検索を同じ引数で引き直し、結果を表で利用者の画面に描く。' +
  `事業や科目を一覧で見せる方が文より分かりやすいときに使う。tool に検索の tool の名前、arguments にその tool に渡す引数（同じ形）を渡す。表は ${MAX_ROWS} 行まで。` +
  '続きを見せるときは、結果の next_page_token を arguments.page_token に入れて呼び直す。'

type Table = 'search_expenditure_subjects' | 'search_expenditure_details'
type Row = ViewData<'expenditure_table'>['groups'][number]['rows'][number]
type Origins = WebOpOutput<'search_expenditure_subjects'>['origins']
type Subject = WebOpOutput<'search_expenditure_subjects'>['subjects'][number]
type Detail = WebOpOutput<'search_expenditure_details'>['details'][number]

const PHASE_LABEL = { executed: '決算額', approved: '当初予算額' } as const
const DOC_LABEL = { settlement: '決算', initial: '当初予算' } as const

const yenText = (yen: number | null) => (yen == null ? '金額なし' : `${yen.toLocaleString('ja-JP')}円`)
const nameOf = (code: string) => NAMES[code]?.name ?? code

function urlOf(origins: Origins, n: { origin_id: string; source_page: number | null }) {
  const url = origins.find((o) => o.origin_id === n.origin_id)?.url
  return url ? (n.source_page ? `${url}#page=${n.source_page}` : url) : null
}

/** 行がまたぐ自治体・年度。1つなら表の見出しに、複数なら行ごとに書く */
function scope(rows: (Subject | Detail)[]) {
  const places = new Set(rows.map((r) => r.jurisdiction_code))
  const years = new Set(rows.map((r) => r.fiscal_year))
  const mixed = places.size > 1 || years.size > 1
  return { mixed, single: places.size === 1 ? rows[0]!.jurisdiction_code : null, where: (r: Subject | Detail) => (mixed ? `${nameOf(r.jurisdiction_code)} ${reiwa(r.fiscal_year)}` : null) }
}

function subjectRows(rows: Subject[], origins: Origins, where: (r: Subject) => string | null): Row[] {
  return rows.map((r) => ({
    name: r.name,
    level: r.level,
    under: r.level === '款' ? null : r.level === '項' ? r.kan_name : [r.kan_name, r.kou_name].filter(Boolean).join(' › '),
    department: null,
    yen: r.amount_yen,
    url: urlOf(origins, r),
    where: where(r),
  }))
}

/** 内訳は分け方（事業・節・その他）ごとに分ける。分け方の違う表どうしは同じ支出の別の切り口なので、同じ表に混ぜない。
 * 行は AI が選んだ並び（金額の順など）のままなので、字下げで親子を見せず、親の名前（結果に無ければ科目の名前）を添える */
function detailGroups(rows: Detail[], origins: Origins, where: (r: Detail) => string | null) {
  const names = new Map(rows.map((r) => [r.detail_id, r.name]))
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const list = groups.get(r.breakdown) ?? groups.set(r.breakdown, []).get(r.breakdown)!
    list.push({
      name: r.name,
      level: null,
      under: (r.parent_detail_id ? names.get(r.parent_detail_id) : undefined) ?? r.moku_name ?? r.kou_name ?? r.kan_name,
      // 名前の【】に所管課が入っているときは重ねない
      department: r.department && !r.name.includes(r.department) ? r.department : null,
      yen: r.amount_yen,
      url: urlOf(origins, r),
      where: where(r),
    })
  }
  return [...groups].map(([b, list]) => ({ heading: b === 'その他' ? 'その他の内訳' : `${b}で分けた内訳`, rows: list }))
}

export function showExpenditureTableTool(env: Env) {
  return dynamicTool({
    description: DESCRIPTION,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        tool: { type: 'string', enum: ['search_expenditure_subjects', 'search_expenditure_details'] },
        arguments: { type: 'object', description: '検索の tool に渡す引数（document_kind・fiscal_year・where・order_by・page_token）' },
      },
      required: ['tool', 'arguments'],
      additionalProperties: false,
    }),
    execute: async (input) => {
      const { tool, arguments: args } = input as { tool: Table; arguments: Record<string, unknown> }
      // 続きの token は page_size が違っても使える（api の page_token の約束）
      const query = { ...args, page_size: Math.min(Number(args.page_size) || MAX_ROWS, MAX_ROWS) }
      try {
        const call = apiCall(env)
        const r =
          tool === 'search_expenditure_subjects'
            ? { kind: 'subjects' as const, ...(await call(tool, query as WebOpInput<typeof tool>)) }
            : { kind: 'details' as const, ...(await call(tool, query as WebOpInput<typeof tool>)) }
        const rows: (Subject | Detail)[] = r.kind === 'subjects' ? r.subjects : r.details
        if (rows.length === 0) return viewError('条件に合う行がありません。条件を見直してください')
        const s = scope(rows)
        const first = rows[0]!
        const groups = r.kind === 'subjects' ? [{ heading: null, rows: subjectRows(r.subjects, r.origins, s.where) }] : detailGroups(r.details, r.origins, s.where)
        const title = s.mixed ? `${r.kind === 'subjects' ? '科目' : '内訳'}（${DOC_LABEL[first.document_kind]}）` : `${nameOf(first.jurisdiction_code)} ${reiwa(first.fiscal_year)} ${DOC_LABEL[first.document_kind]}の${r.kind === 'subjects' ? '科目' : '内訳'}`
        const hasMore = !!r.next_page_token
        const message = [
          `利用者の画面に表（${rows.length}行${hasMore ? '、続きあり' : ''}）を描きました。表の行を文で繰り返さず、問いへの答えと要点だけを短く書いてください。` +
            (groups.length > 1 ? '分け方（事業・節など）の違う内訳は同じ支出の別の切り口なので、足さないでください。' : ''),
          hasMore ? `続きを見せるときは arguments.page_token に次の値を入れて呼び直してください: ${r.next_page_token}` : '',
          ...groups.flatMap((g) => [g.heading ? `# ${g.heading}` : '', ...g.rows.map((x) => `${x.where ? `${x.where} ` : ''}${x.under ? `${x.under} › ` : ''}${x.name}: ${yenText(x.yen)}`)]).filter(Boolean),
        ].filter(Boolean).join('\n')
        return viewResult(message, {
          kind: 'expenditure_table',
          v: 1,
          data: { table: r.kind, title, amountLabel: PHASE_LABEL[first.amount_phase], groups, hasMore, path: s.single ? `${jurisdictionPath(s.single)}/${first.fiscal_year}/${first.document_kind === 'initial' ? 'budget' : 'settlement'}` : null },
        })
      } catch (e) {
        if (e instanceof FudokiApiError && e.status === 400) return viewError(`検索の引数が正しくありません: ${e.message}`)
        logError(e)
        return viewError('風土記の API から読めませんでした')
      }
    },
    toModelOutput,
  })
}
