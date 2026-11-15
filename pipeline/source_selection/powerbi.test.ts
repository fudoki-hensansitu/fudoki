import { expect, test } from 'bun:test'
import { apiOriginFromCluster, decodeDataShape, parseReportUrl, toCsv, type DataShape } from './powerbi'

const key = { k: '7e440dea-4001-4634-8c12-c7a645641680', t: '3a3c7af6-fa08-4727-a8bc-210cfb773dc0' }

test('a report URL gives its resource key and tenant, and the cluster page host becomes the API host', () => {
  const url = `https://app.powerbi.com/view?r=${Buffer.from(JSON.stringify(key)).toString('base64')}`
  expect(parseReportUrl(url)).toEqual(key)
  expect(() => parseReportUrl('https://example.com/view?r=' + Buffer.from(JSON.stringify(key)).toString('base64'))).toThrow()
  expect(() => parseReportUrl(`https://app.powerbi.com/view?r=${Buffer.from(JSON.stringify({ k: 'x', t: 'y' })).toString('base64')}`)).toThrow()
  expect(apiOriginFromCluster('https://wabi-japan-east-b-primary-redirect.analysis.windows.net/')).toBe('https://wabi-japan-east-b-primary-api.analysis.windows.net')
  expect(apiOriginFromCluster('https://global-wabi-us-north-central-redirect.analysis.windows.net/')).toBe('https://wabi-us-north-central-api.analysis.windows.net')
})

test('a data shape is restored: repeated columns (R), null columns (Ø), dictionary values, inline strings and 64-bit integers', () => {
  const rows = decodeDataShape({
    IC: true,
    ValueDicts: { D0: ['達成'] },
    PH: [{ DM0: [
      { S: [{ N: 'G0', T: 4 }, { N: 'G1', T: 4 }, { N: 'G2', T: 1 }, { N: 'G3', T: 1, DN: 'D0' }], C: [1, 'A', 0], 'Ø': 2 },
      { C: [2], R: 12, 'Ø': 2 },
      { C: [3, '123L', 'B'], R: 8 },
    ] }],
  })
  expect(rows).toEqual([[1, null, 'A', '達成'], [2, null, 'A', '達成'], [3, 123, 'B', '達成']])
})

test('bitmasks wider than 32 columns are read without overflow', () => {
  const wide = Array.from({ length: 40 }, (_, index) => ({ N: `G${index}`, T: 1 }))
  const last = Number(1n << 39n)
  const values = Array.from({ length: 39 }, (_, index) => `w${index}`)
  const rows = decodeDataShape({ IC: true, PH: [{ DM0: [{ S: wide, C: values, 'Ø': last }, { C: values, R: last }] }] })
  for (const row of rows) {
    expect(row[38]).toBe('w38')
    expect(row[39]).toBeNull()
  }
})

test('an incomplete or inconsistent result stops instead of giving fewer rows', () => {
  expect(() => decodeDataShape({ IC: false, PH: [{ DM0: [] }] })).toThrow('incomplete')
  expect(() => decodeDataShape({ IC: true, PH: [{ DM0: [{ S: [{ N: 'G0', T: 1 }, { N: 'G1', T: 1 }], C: ['a'] }] }] })).toThrow('fewer values')
  expect(() => decodeDataShape({ IC: true, PH: [{ DM0: [{ S: [{ N: 'G0', T: 1 }], C: ['a', 'b'] }] }] })).toThrow('more values')
})

test('CSV is RFC 4180 with LF: quotes, commas and newlines are escaped and null is empty', () => {
  expect(toCsv(['番号', '目的'], [[1, 'a,b'], [2, '"引用"\r\n改行'], [3, null]])).toBe('番号,目的\n1,"a,b"\n2,"""引用""\n改行"\n3,\n')
})
