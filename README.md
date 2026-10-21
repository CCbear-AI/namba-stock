# 台股難波萬

自用台股看盤網站（Next.js 16 + lightweight-charts）。

## 頁面
- `/` 首頁：加權／櫃買、自選股、漲跌幅／成交值／外資買超排行、飆股訊號（RVOL、連板、法人連買）、盤中動態
- `/gainers` 漲幅排行：當日／近 5／20／60 日、範圍與成交值篩選、走勢預覽、鎖定排序、多股比較
- `/taiex` 大盤：加權／櫃買 K 線、台指期與價差、買賣力道、權值股貢獻點數、漲跌家數、法人與信用、類股、國際行情
- `/heatmap` 熱力圖：當日／近 5／20／60 日，市值或成交值決定面積
- `/sector` 類股 K 線：上市、上櫃官方類股指數 K 線 + 成分股
- `/flow-live` 即時資金流：各板塊主動買賣淨額，可回放、匯出圖片／影片
- `/watchlist` 自選股：自訂群組、0050 權值股／創歷史新高／近 20 日漲超 20%，列表／熱力圖／河道，匯出影片
- `/stock/[code]` 個股：K 線（分時、1/5/15/30/60 分、日週月）、74 個技術指標、畫線工具、超級支撐壓力、五檔、外盤內盤、籌碼、主力分點
- `/multi` 多股看盤：2/4/6/9 格，當日／近 20／60／180 日
- `/radar` 破頂雷達：上市以來新高、即將破頂、新低
- `/pattern` 相似股：正在形成、歷史相似（之後 5／10／20 日統計）
- `/screener` 選股器：24 個條件、5 個快速策略
- `/alerts` 提醒：到價、漲跌幅、漲跌停、法人買超、選股策略、RVOL、爆量卡關；網頁通知與背景推播
- `/chips` 籌碼：大盤法人、期貨選擇權、買賣超排行、個股籌碼、主力分點
- `/limits` 漲跌停：家數、封板率、連板、分布、族群、名單

## 資料來源（全部免費）
- 即時報價：證交所 MIS（一次 100 檔、依序抓）；委買委賣統計、每分鐘量能：MIS mis_ohlc 資料檔
- 台指期即時：期交所 MIS
- 個股與加權 K 線：Yahoo Finance chart API；國際行情也是
- 全市場日 K、三大法人、融資券、外資持股、借券、當沖：證交所／櫃買中心盤後資料 → `data/daily`、`data/chips`
- 類股指數日 K：證交所 MI_5MINS_INDEX → `data/sector-tse.json`；櫃買 sectinx → `data/sector-otc.json`
- 期貨選擇權籌碼：期交所盤後 CSV → `data/futures.json`
- 千張大戶、股東人數：集保開放資料（每週）→ `data/tdcc`
- 上市以來最高最低：Yahoo 月 K + 每日日 K → `data/ath.json`
- 主力分點：富邦證券 DJ 公開資訊頁（非正式 API）

## 指令
- `npm run dev` 本機開發
- `npm run market-history -- 2025-09-01` 回補日 K／籌碼（不帶日期＝補最近 14 天）
- `npm run futures`、`npm run tdcc`、`npm run ath`（`-- update` 只用最新日 K 更新）、`npm run volcurve`
- `npm run flow-recorder` 盤中資金流記錄＋盤中動態＋背景推播（`-- --test 2` 不看時間跑 2 輪測試）

## 自動排程（GitHub Actions）
- `flow-recorder.yml`：交易日 08:50 啟動，盤中每 30 秒記一筆、判斷漲跌停與量能事件、檢查提醒並推播，收盤後 commit `data/flow/日期.json`
- `daily-data.yml`：交易日 16:30 更新全部盤後資料並推播法人買超提醒；週六早上抓集保

## 背景推播
需要 Supabase 執行 `supabase/push.sql`，GitHub Secrets 要有 `VAPID_PRIVATE_KEY`（公鑰在 `lib/pushKey.ts`）。

## 即時資金流要「盤中即時」看
沒設定 Supabase 時，只能在收盤 commit 後看當天紀錄（回放）。要盤中即時：
1. 建 Supabase 專案，執行 `supabase/schema.sql`
2. GitHub repo Secrets 加 `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`
3. Vercel 環境變數加 `SUPABASE_URL`、`SUPABASE_ANON_KEY`
