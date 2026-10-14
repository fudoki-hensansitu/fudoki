import type { Jurisdiction, Origin, TreeNode, ViewData } from '../ui/types'

const origin: Origin = {
  origin_id: 'ok',
  title: '試験原典 ok',
  url: 'https://city.fudoki.dev/ok.pdf',
  format: 'pdf',
}
export const node: TreeNode = {
  document_kind: 'settlement',
  node_id: 'ui-parent',
  jurisdiction_code: '000001',
  fiscal_year: 2024,
  account_name: '一般会計',
  axis: '科目',
  node_kind: '目',
  code: null,
  name: '総務管理',
  amount_yen: 12345,
  kan_name: '総務費',
  kou_name: '総務管理費',
  origin_id: 'ok',
  source_page: 1,
  source_x0: 35,
  source_y0: 40,
  source_x1: 240,
  source_y1: 80,
  amount_source_page: 2,
  amount_source_x0: 35,
  amount_source_y0: 140,
  amount_source_x1: 240,
  amount_source_y1: 180,
}
const jurisdiction = (
  code: string,
  name: string,
  covered = true,
): Jurisdiction => ({
  jurisdiction_code: code,
  name,
  prefecture_name: '試験県',
  coverage: covered
    ? [
        {
          fiscal_year: 2024,
          document_kind: 'settlement',
          accounts: [
            {
              account_name: '一般会計',
              account_kind: '一般会計',
              origins: [origin],
            },
          ],
        },
      ]
    : [],
})
export const child = {
  ...node,
  node_id: 'ui-child',
  node_kind: '節',
  name: '委託料',
  amount_yen: null,
}
export function uiData(scenario: string, more = false, nodeId?: string): ViewData {
  if (scenario.startsWith('chart')) return chartData(scenario, nodeId, more)
  if (scenario === 'pdf-locations')
    return {
      nodes: [
        {
          ...node,
          node_id: 'ui-amount-only',
          name: '金額頁だけ',
          source_page: null,
        },
        {
          ...node,
          node_id: 'ui-invalid-page',
          name: '不正な項目頁',
          source_page: -1,
        },
        {
          ...node,
          node_id: 'ui-no-page',
          name: '頁不明',
          source_page: null,
          amount_source_page: null,
        },
      ],
      origins: [origin],
    }
  if (scenario === 'jurisdictions')
    return {
      jurisdictions: more
        ? [jurisdiction('000003', '追加市')]
        : [
            jurisdiction('000001', '試験市'),
            jurisdiction('000002', '未収録町', false),
          ],
      next_page_token: more ? null : 'jurisdictions-next',
    }
  if (scenario === 'single')
    return { jurisdictions: [jurisdiction('000001', '試験市')] }
  if (scenario === 'empty-jurisdictions') return { jurisdictions: [] }
  if (scenario === 'empty') return { nodes: [] }
  if (scenario === 'detail')
    return {
      node,
      children: more
        ? {
            節: [
              {
                ...child,
                node_id: 'ui-more-child',
                name: '備品購入費',
                amount_yen: 2345,
              },
            ],
          }
        : {
            節: [child],
            事業: [{ ...node, node_id: 'ui-project', name: '庁舎管理' }],
          },
      origins: [origin],
      next_page_token: more ? null : 'detail-next',
    }
  if (scenario === 'leaf')
    return { node: child, children: {}, origins: [origin] }
  return {
    nodes: more
      ? [{ ...node, node_id: 'ui-more', name: '追加された明細' }]
      : [node],
    origins: more ? [] : [origin],
    next_page_token: more ? null : 'search-next',
  }
}

const fiscal = (id: string, name: string, kind: string, amount: number | null, parent: string | null,
  kan = name, kou: string | null = null): TreeNode => ({
  ...node, node_id: id, name, node_kind: kind, amount_yen: amount,
  parent_node_id: parent, is_subject: true, kan_name: kan, kou_name: kou,
})
const kanGeneral = fiscal('kan-general', '総務費', '款', 6000, null)
const kanWelfare = fiscal('kan-welfare', '民生費', '款', 4000, null)
const kouAdmin = fiscal('kou-admin', '総務管理費', '項', 4000, 'kan-general', '総務費', '総務管理費')
const kouTax = fiscal('kou-tax', '徴税費', '項', 2000, 'kan-general', '総務費', '徴税費')
const kouWelfare = fiscal('kou-welfare', '社会福祉費', '項', 4000, 'kan-welfare', '民生費', '社会福祉費')
const mokuAdmin = fiscal('moku-admin', '一般管理費', '目', 2500, 'kou-admin', '総務費', '総務管理費')
const mokuPlan = fiscal('moku-plan', '企画費', '目', 1500, 'kou-admin', '総務費', '総務管理費')
const mokuTax = fiscal('moku-tax', '税務総務費', '目', 2000, 'kou-tax', '総務費', '徴税費')
const mokuWelfare = fiscal('moku-welfare', '福祉総務費', '目', 4000, 'kou-welfare', '民生費', '社会福祉費')
const hierarchy = [kanGeneral, kanWelfare, kouAdmin, kouTax, kouWelfare, mokuAdmin, mokuPlan, mokuTax, mokuWelfare]
export function chartData(scenario: string, id?: string, more = false): ViewData {
  if (id) {
    const self = hierarchy.find((n) => n.node_id === id)!
    const children = hierarchy.filter((n) => n.parent_node_id === id)
    return { node: self, children: children.length ? { 科目: children } : {}, origins: [origin], next_page_token: null }
  }
  if (scenario === 'chart-kan') return { nodes: [kouAdmin, kouTax], origins: [origin], next_page_token: null }
  if (scenario === 'chart-partial') return { nodes: more ? [kanWelfare] : [kanGeneral], origins: [origin], next_page_token: more ? null : 'chart-next' }
  if (scenario === 'chart-mixed') return { nodes: [kanGeneral, kanWelfare, kouAdmin,
    { ...kanGeneral, node_id: 'other-year', fiscal_year: 2025 },
    { ...kanGeneral, node_id: 'other-account', account_name: '特別会計' }], origins: [origin], next_page_token: null }
  if (scenario === 'chart-invalid') return { nodes: [kanGeneral, { ...kanWelfare, amount_yen: null }], origins: [origin], next_page_token: null }
  return { nodes: [kanGeneral, kanWelfare], origins: [origin], next_page_token: null }
}
