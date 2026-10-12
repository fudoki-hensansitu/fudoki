-- 配信の kill switch（ADR 0022）。marts の表は pipeline/serving/sync_d1.py が作る（migration では作らない）。
create table control (
  key text primary key,
  value text not null
);

insert into control (key, value) values ('serving', 'on');
