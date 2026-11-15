-- 市区町村の決算の指標（scripts/sync-data/local_finance.py が全行を入れ替える）。
-- 出典は総務省「市町村別決算状況調」の普通会計。Queria に入るまでは総務省の Excel から読む。
-- 1行は1つの市区町村の1つの決算年度。金額は円、比率は %。
-- 空欄・「-」は NULL（赤字が無いときの実質赤字比率、特別区の標準財政規模・財政力指数など）
CREATE TABLE local_finance (
  -- 全国地方公共団体コード（6桁）
  jurisdiction_code TEXT NOT NULL,
  -- 決算年度（西暦）
  fiscal_year INTEGER NOT NULL,
  -- 歳出総額
  expenditure_total_yen INTEGER,
  -- 標準財政規模（標準的に入る一般財源の大きさ）
  standard_fiscal_scale_yen INTEGER,
  -- 実質収支（歳入歳出の差引から翌年度に繰り越すべき財源を引いた額）
  real_balance_yen INTEGER,
  -- 実質収支比率（実質収支 ÷ 標準財政規模）
  real_balance_ratio REAL,
  -- 経常収支比率
  current_balance_ratio REAL,
  -- 財政力指数（3年平均）
  fiscal_capability_index REAL,
  -- 健全化判断比率の4つ
  real_deficit_ratio REAL,
  consolidated_real_deficit_ratio REAL,
  real_debt_service_ratio REAL,
  future_burden_ratio REAL,
  -- 性質別歳出のうち人件費・扶助費・公債費（義務的経費）
  personnel_yen INTEGER,
  social_assistance_yen INTEGER,
  debt_service_yen INTEGER,
  -- 年度末の地方債現在高
  local_bond_balance_yen INTEGER,
  -- 年度末の積立金現在高（基金）と、その内訳の財政調整基金・減債基金・その他特定目的基金
  fund_balance_yen INTEGER,
  fiscal_adjustment_fund_yen INTEGER,
  debt_reduction_fund_yen INTEGER,
  specified_purpose_fund_yen INTEGER,
  PRIMARY KEY (jurisdiction_code, fiscal_year)
);
