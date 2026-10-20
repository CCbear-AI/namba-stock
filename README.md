# 台股難波萬

自用台股看盤網站（Next.js 16 + lightweight-charts）。

## 頁面
- `/` 首頁：加權分時/日K、自選股、漲跌幅/成交值排行、族群漲跌、飆股訊號
- `/stock/[code]` 個股：K 線（分時/分K/日週月K、MA5/20/60）、最佳五檔、分時明細、超級支撐壓力
- `/heatmap` 熱力圖：依產業分區，市值或成交值決定面積
- `/sector` 類股 K 線：官方類股指數 K 線 + 成分股，點成分股可看個股並判讀超級支撐壓力
- `/flow-live` 即時資金流：各板塊主動買賣淨額（外盤−內盤），5/15/30 分或全天、可回放
- `/multi` 多股看盤：2/4/6/9 格

## 資料來源（全部免費）
- 即時報價：證交所基本市況報導 MIS（一次 100 檔、依序抓）
- 個股與加權 K 線：Yahoo Finance chart API
- 類股指數日 K：證交所 MI_5MINS_INDEX（每 5 秒指數）算開高低收 → `data/sector-tse.json`
- 股票清單/產業/股數：證交所、櫃買 OpenAPI → `data/universe.json`

## 指令
- `npm run dev` 本機開發
- `npm run universe` 更新股票清單
- `npm run sector-history` 補類股日 K（已有的日期跳過）
- `npm run flow-recorder` 盤中資金流記錄（`-- --test 2` 不看時間跑 2 輪測試）

## 自動排程（GitHub Actions）
- `flow-recorder.yml`：交易日 08:50 啟動，盤中每 30 秒記一筆，收盤後 commit `data/flow/日期.json`
- `daily-data.yml`：交易日 16:30 更新類股日 K 與股票清單

## 即時資金流要「盤中即時」看
沒設定 Supabase 時，只能在收盤 commit 後看當天紀錄（回放）。要盤中即時：
1. 建 Supabase 專案，執行 `supabase/schema.sql`
2. GitHub repo Secrets 加 `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`
3. Vercel 環境變數加 `SUPABASE_URL`、`SUPABASE_ANON_KEY`
