-- 即時資金流（盤中每 30 秒更新一次當天這一列）
create table if not exists flow_days (
  date text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 只允許讀取；寫入用 service key（GitHub Actions）
alter table flow_days enable row level security;
create policy "public read" on flow_days for select using (true);
