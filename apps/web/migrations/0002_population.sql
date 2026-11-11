-- 住民基本台帳人口（server/population.ts が読み、scripts/sync-data/population.py が全行を入れ替える）。
-- 出典は総務省「住民基本台帳に基づく人口、人口動態及び世帯数」の総計で、Queria（e_stat.resident_registry.population）から読む。
-- 1行は1つの自治体（都道府県・市区町村）の1つの基準日（毎年1月1日）
CREATE TABLE population (
  -- 全国地方公共団体コード（6桁）
  jurisdiction_code TEXT NOT NULL,
  -- 基準日（YYYY-MM-DD）
  reference_date TEXT NOT NULL,
  male INTEGER NOT NULL,
  female INTEGER NOT NULL,
  -- 総数。性別欄が空欄の外国人住民を含むので、male と female の和より大きいことがある
  population INTEGER NOT NULL,
  households INTEGER NOT NULL,
  PRIMARY KEY (jurisdiction_code, reference_date)
);
