/** COFOG 1999 の大分類。**ここが唯一の定義**で、SQL に埋める値もここから作る */
export const COFOG_DIVISIONS: Record<string, string> = {
  '01': '一般公共サービス',
  '02': '防衛',
  '03': '公共の秩序及び安全',
  '04': '経済業務',
  '05': '環境保護',
  '06': '住宅及び地域アメニティ',
  '07': '保健',
  '08': '娯楽、文化及び宗教',
  '09': '教育',
  '10': '社会保護',
}

/**
 * COFOG の中分類（`04.5`）と小分類（`04.5.1`）の名称。
 *
 * ⚠️ **規則が使うコードだけを持つ。** COFOG 1999 の全 69 中分類・109 小分類を写すと、
 * 使っていない大半が検証されないまま増える。規則が新しいコードを使ったら
 * `cofogLabel` が落ちるので、黙って名称なしで配られることはない。
 *
 * ⚠️ **小分類を足したらその親の中分類も要る。** `04.1.2` は
 * 04.1（一般経済・商業・労働関係）の下にあり、画面は division → group → class の
 * 連なりで見せるため、途中が欠けると「まだ降りていない」と区別がつかなくなる。
 */
export const COFOG_GROUPS: Record<string, string> = {
  '01.1': '立法機関及び行政機関、財政・財務、対外関係',
  '01.3': '総合的サービス',
  '01.6': '他に分類されない一般公共サービス',
  '01.7': '公債取引',
  '03.2': '消防サービス',
  '04.1': '一般経済・商業・労働関係',
  '04.2': '農業、林業、漁業及び狩猟',
  '04.4': '鉱業・製造業・建設業',
  '04.5': '運輸',
  '04.7': 'その他の産業',
  '05.1': '廃棄物管理',
  '05.2': '排水管理',
  '05.3': '汚染防止',
  '05.4': '生物多様性及び景観の保護',
  '06.1': '住宅開発',
  '06.2': '地域開発',
  '06.4': '街路照明',
  '07.2': '外来サービス',
  '07.4': '公衆衛生サービス',
  '08.1': 'レクリエーション及びスポーツのサービス',
  '08.2': '文化サービス',
  '09.1': '就学前教育及び初等教育',
  '09.2': '中等教育',
  '09.5': '水準が定義できない教育',
  '09.6': '教育に付帯するサービス',
  '09.8': '他に分類されない教育',
  '10.1': '疾病及び障害',
  '10.2': '高齢',
  '10.4': '家族及び児童',
  '10.7': '社会的排除（他に分類されないもの）',
  '10.9': '他に分類されない社会保護',
}

export const COFOG_CLASSES: Record<string, string> = {
  '01.1.2': '財政・財務業務',
  '01.3.1': '一般人事サービス',
  '01.3.2': '総合企画・統計サービス',
  '01.3.3': 'その他一般サービス',
  '04.1.2': '一般労働業務',
  '04.5.1': '道路交通',
}

/** COFOG の深さ。`cofog_code` の段数がそのまま到達した深さになる */
export const COFOG_DEPTHS = ['division', 'group', 'class'] as const
export type CofogDepth = (typeof COFOG_DEPTHS)[number]

/** 深さから名称表を引く。**深さの集合と対で置く** — 離すと片方だけ直る */
export const COFOG_NAMES: Record<CofogDepth, Record<string, string>> = {
  division: COFOG_DIVISIONS,
  group: COFOG_GROUPS,
  class: COFOG_CLASSES,
}

export const COFOG_DEPTH_JA: Record<CofogDepth, string> = {
  division: '大分類（2桁）',
  group: '中分類（04.5）',
  class: '小分類（04.5.1）',
}

/**
 * COFOG コードの名称。**空のコードは空の名称**（「まだ降りていない」を潰さない）。
 * 名称の無いコードは落とす — 規則が新しいコードを使ったら宣言を足すまで気づける。
 */
export function cofogLabel(depth: CofogDepth, code: string): string {
  if (!code) return ''
  const label = COFOG_NAMES[depth][code]
  if (label === undefined) {
    throw new Error(
      `COFOG ${depth} ${code} の名称が packages/fiscal/cofog-master.ts に無い。` +
        `規則（pipeline/dbt/seeds/fiscal/cofog_rules.csv）が使うコードは宣言が要る`
    )
  }
  return label
}

/** Codes used by the current rules, including every parent needed for their hierarchy. */
export function cofogMaster() {
  const rows = COFOG_DEPTHS.flatMap((level) =>
    Object.entries(COFOG_NAMES[level]).map(([code, label]) => ({
      code,
      label,
      level,
      parent_code: code.includes('.')
        ? code.slice(0, code.lastIndexOf('.'))
        : null,
    }))
  ).sort((a, b) => a.code.localeCompare(b.code))
  const codes = new Set(rows.map((row) => row.code))
  for (const row of rows)
    if (row.parent_code !== null && !codes.has(row.parent_code))
      throw new Error(`COFOG parent is missing: ${row.code}`)
  return rows
}
