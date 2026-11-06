#!/usr/bin/env bash
# 推送後確認 Vercel 有沒有自動部署：等最多 3 分鐘看這個 commit 有沒有出現「Vercel」狀態，
# 有就不用再打部署鉤子（避免同一個 commit 部署兩次、佔 Function Storage）；沒有才打鉤子補救（10/27 曾漏接）。
# 需要 env：HOOK（部署鉤子網址）、GH_TOKEN；workflow 要有 statuses: read 權限
set -u
if [ -z "${HOOK:-}" ]; then echo "沒設 VERCEL_DEPLOY_HOOK，略過"; exit 0; fi
sha=$(git rev-parse HEAD)
for i in $(seq 1 18); do
  n=$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/statuses" --jq '[.[]|select(.context=="Vercel")]|length' 2>/dev/null || echo 0)
  if [ "${n:-0}" -gt 0 ]; then echo "Vercel 已自動部署 $sha，不用打鉤子"; exit 0; fi
  sleep 10
done
curl -fsS -X POST "$HOOK" > /dev/null && echo "3 分鐘內沒看到 Vercel 自動部署，已打部署鉤子"
