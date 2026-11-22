// 月給（額面）から、その人が払う住民税を見積もる。レシートを「私のお金」で刷るための入口（2026-11-21 yuito「通知額は覚えていない。月給から入れるべき」）。
// 会社員（給与だけ）・協会けんぽ（東京）・厚生年金・雇用保険を前提にした目安で、正確な税額ではない。
// 所得税は国に入るので、まちのレシートには使わない（住民税のうち区市町村の分と都道府県の分だけを出す）

/** 見積もりの前提。既定（標準）は、ひとり・扶養なし・40歳未満・ボーナスなし */
export type Household = {
  /** 扶養している配偶者（収入なし）がいる */
  spouse: boolean
  /** 扶養している家族の数（16歳以上。16歳未満の子は控除が無く、非課税の線だけに効く） */
  dependents: number
  /** 16歳未満の子の数 */
  children: number
  /** 40〜64歳（介護保険料がかかる） */
  over40: boolean
  /** ボーナスは年に月給の何か月分か */
  bonusMonths: number
}

export const STANDARD: Household = { spouse: false, dependents: 0, children: 0, over40: false, bonusMonths: 0 }

/** 給与所得控除（2025年分から。最低 65 万円） */
export function employmentDeduction(salary: number) {
  if (salary <= 1_900_000) return Math.min(salary, 650_000)
  if (salary <= 3_600_000) return Math.floor(salary * 0.3) + 80_000
  if (salary <= 6_600_000) return Math.floor(salary * 0.2) + 440_000
  if (salary <= 8_500_000) return Math.floor(salary * 0.1) + 1_100_000
  return 1_950_000
}

/** 本人が払う社会保険料の率（R7 年度。協会けんぽ東京 9.91%・介護 1.59%・厚生年金 18.3% をそれぞれ折半、雇用保険 0.55%） */
const HEALTH = 0.0991 / 2
const CARE = 0.0159 / 2
const PENSION = 0.183 / 2
const EMPLOYMENT = 0.0055
/** 標準報酬の上限（厚生年金は月 65 万円・賞与1回 150 万円、健康保険は月 139 万円・賞与は年 573 万円） */
const PENSION_CAP = 650_000
const PENSION_BONUS_CAP = 1_500_000
const HEALTH_CAP = 1_390_000
const HEALTH_BONUS_CAP = 5_730_000

/** 1年の社会保険料（本人の分）。ボーナスは年1回にまとめて払う形で数える */
export function socialInsurance(monthly: number, h: Household) {
  const health = HEALTH + (h.over40 ? CARE : 0)
  const bonus = monthly * h.bonusMonths
  const month = Math.min(monthly, HEALTH_CAP) * health + Math.min(monthly, PENSION_CAP) * PENSION + monthly * EMPLOYMENT
  const yearBonus = Math.min(bonus, HEALTH_BONUS_CAP) * health + Math.min(bonus, PENSION_BONUS_CAP) * PENSION + bonus * EMPLOYMENT
  return Math.round(month * 12 + yearBonus)
}

/** 住民税の人的控除（基礎 43 万・配偶者 33 万・扶養 33 万）と、所得税との差（調整控除に使う。基礎 5 万・配偶者 5 万・扶養 5 万） */
const BASIC = 430_000
const SPOUSE = 330_000
const DEPENDENT = 330_000
const GAP = 50_000

/** 均等割（区市町村 3,000 円・都道府県 1,000 円）。森林環境税（1,000 円）は国の税なので入れない */
const FLAT_CITY = 3_000
const FLAT_PREF = 1_000

export type ResidentTax = {
  /** 1年の給与（額面） */
  salary: number
  /** 区市町村に払う分（所得割 6% と均等割） */
  city: number
  /** 都道府県に払う分（所得割 4% と均等割） */
  pref: number
}

/** 月給（額面）から1年の住民税を見積もる。非課税の線と調整控除は1級地（東京23区など）のもの */
export function residentTax(monthly: number, h: Household = STANDARD): ResidentTax {
  const salary = Math.round(monthly * (12 + h.bonusMonths))
  const income = Math.max(0, salary - employmentDeduction(salary))
  const people = 1 + (h.spouse ? 1 : 0) + h.dependents + h.children
  const family = people > 1
  // 非課税の線（合計所得）。均等割は 35万×人数+10万（家族がいれば +21万）、所得割は 35万×人数+10万（家族がいれば +32万）
  if (income <= 350_000 * people + 100_000 + (family ? 210_000 : 0)) return { salary, city: 0, pref: 0 }
  const flat = { city: FLAT_CITY, pref: FLAT_PREF }
  if (income <= 350_000 * people + 100_000 + (family ? 320_000 : 0)) return { salary, ...flat }
  const deductions = socialInsurance(monthly, h) + BASIC + (h.spouse ? SPOUSE : 0) + h.dependents * DEPENDENT
  const taxable = Math.floor(Math.max(0, income - deductions) / 1000) * 1000
  const gap = GAP * (1 + (h.spouse ? 1 : 0) + h.dependents)
  const adjust = taxable <= 2_000_000 ? Math.min(gap, taxable) * 0.05 : Math.max((gap - (taxable - 2_000_000)) * 0.05, 2_500)
  // 所得割は 100 円未満を切り捨てる。調整控除は 6:4 で分ける
  const part = (rate: number, share: number) => Math.max(0, Math.floor((taxable * rate - adjust * share) / 100) * 100)
  return { salary, city: part(0.06, 0.6) + flat.city, pref: part(0.04, 0.4) + flat.pref }
}
