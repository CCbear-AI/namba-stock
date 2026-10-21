-- 背景推播：每台裝置一列（推播訂閱 + 提醒規則）
-- 表格不開放直接讀寫，只能透過下面兩個函式存取（裝置 ID 是瀏覽器隨機產生的長字串）
create table if not exists push_subs (
  device text primary key,
  sub jsonb not null,
  rules jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table push_subs enable row level security;

create or replace function save_push(p_device text, p_sub jsonb, p_rules jsonb) returns void
language sql security definer set search_path = public as $$
  insert into push_subs (device, sub, rules, updated_at) values (p_device, p_sub, p_rules, now())
  on conflict (device) do update set sub = excluded.sub, rules = excluded.rules, updated_at = now();
$$;

create or replace function delete_push(p_device text) returns void
language sql security definer set search_path = public as $$
  delete from push_subs where device = p_device;
$$;

grant execute on function save_push(text, jsonb, jsonb) to anon;
grant execute on function delete_push(text) to anon;
