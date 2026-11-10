-- 事業評価の検索（AI Search）をやめた（docs/prd/aggregate-api/dd.md）。停止スイッチと上限の行を消す。
delete from control where key in ('evaluation_search', 'evaluation_search_per_minute', 'evaluation_search_per_day');
