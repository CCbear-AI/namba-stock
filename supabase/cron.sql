-- 準時觸發 GitHub Actions（GitHub 自己的排程常延遲 4~5 小時）
-- 用 Supabase 的 pg_cron 定時呼叫 GitHub API 的 workflow_dispatch；時間是 UTC
-- 使用方式：先執行最下面「存 token」那段（換成自己的 token），再執行整份

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_workflow(wf text)
returns void
language plpgsql
security definer
as $$
declare
  tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_token';
  perform net.http_post(
    url := 'https://api.github.com/repos/CCbear-AI/namba-stock/actions/workflows/' || wf || '/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'User-Agent', 'namba-stock-cron',
      'Content-Type', 'application/json'
    )
  );
end;
$$;

revoke all on function public.dispatch_workflow(text) from public, anon, authenticated;

-- 台灣 08:45 盤中資金流記錄器
select cron.schedule('flow-recorder', '45 0 * * 1-5', $$select public.dispatch_workflow('flow-recorder.yml')$$);
-- 台灣 16:30 盤後資料
select cron.schedule('daily-data', '30 8 * * 1-5', $$select public.dispatch_workflow('daily-data.yml')$$);

-- 存 token（只要做一次；token 換新時改用 vault.update_secret）
-- select vault.create_secret('github_pat_這裡貼你的token', 'github_token');

-- 檢查：最近幾次執行結果（status_code 204 = 成功）
-- select id, status_code, created from net._http_response order by created desc limit 5;
