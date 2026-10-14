-- 事業の評価の検索（docs/prd/evaluation-search/dd.md）。control 以外の表は作らない。
-- evaluation_search は初期値 off（公開の条件を満たしてから on にする）。per_minute・per_day は全利用者の合計の上限で、デプロイせずに変えられる。
insert into control (key, value) values ('evaluation_search', 'off');
insert into control (key, value) values ('evaluation_search_per_minute', '30');
insert into control (key, value) values ('evaluation_search_per_day', '1000');
