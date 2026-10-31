---
name: 台股難波萬
description: 給老手散戶的台股看盤與選股研究站：深色底、金色重點、襯線標題、紅漲綠跌
colors:
  ink-black: "#0b0d11"
  panel: "#10141a"
  panel-raised: "#171c23"
  hairline: "#1f252e"
  paper-white: "#ebe7de"
  text-secondary: "#9aa0a8"
  text-dim: "#80868f"
  gold: "#d9b45a"
  gold-light: "#f0d08a"
  gold-wash: "#2a2416"
  up-red: "#f2554f"
  down-green: "#22b573"
  flat-grey: "#c9c9c9"
  support-blue: "#5aa9ff"
  resistance-orange: "#f2994a"
typography:
  page-title:
    fontFamily: "Noto Serif TC, Songti TC, serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "0.03em"
  card-title:
    fontFamily: "Noto Serif TC, Songti TC, serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.04em"
  body:
    fontFamily: "IBM Plex Sans, Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "IBM Plex Sans, Noto Sans TC, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  numeric:
    fontFamily: "IBM Plex Mono, Noto Sans TC, monospace"
    fontSize: "13px"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  chip: "6px"
  control: "8px"
  card: "22px"
  pill: "999px"
spacing:
  cell-y: "6px"
  cell-x: "10px"
  card-x: "16px"
  page-x: "16px"
components:
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.card}"
  button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "#1b1608"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  segmented-on:
    backgroundColor: "{colors.paper-white}"
    textColor: "#111111"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  chip:
    backgroundColor: "{colors.gold-wash}"
    textColor: "{colors.gold-light}"
    rounded: "{rounded.chip}"
    padding: "1px 8px"
  nav-pill-active:
    backgroundColor: "{colors.gold-wash}"
    textColor: "{colors.gold-light}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.paper-white}"
    rounded: "4px"
    padding: "4px 8px"
---

# Design System: 台股難波萬

## Overview

**Creative North Star: "金籤研究筆記"**

難波萬像一本老手的研究筆記：深色紙面上，用襯線字寫下每一張卡片的題目，底下是排得整整齊齊的數字表格，每個結論旁邊都附著依據。金色是夾在筆記裡的書籤，只標在真正要回頭看的地方，例如被選中的分頁、重點標籤、主要按鈕。

資訊密度高是刻意的：使用者是看得懂 K 線、法人、分點的老手，13px 內文、等寬數字、緊湊的表格列，讓一個畫面能掃完更多資料。說明不靠刪減內容，而是靠術語旁的虛線底線與問號浮框就地補充。

紅與綠只用來表示漲跌（台股慣例紅漲綠跌），不拿來裝飾。

**Key Characteristics:**
- 深色墨黑底（不做淺色主題）
- 卡片標題與頁面標題用 Noto Serif TC，其餘用 IBM Plex Sans／Noto Sans TC
- 所有數字用 IBM Plex Mono 等寬字、對齊小數點欄位
- 金色是唯一品牌色，用量克制
- 大圓角卡片（22px）、膠囊形按鈕與分段切換
- 術語就地說明（虛線底線＋浮框）

## Colors

墨黑底上的暖白紙色文字，配一支金色書籤，再加一組只表示行情方向的紅綠。

### Primary
- **書籤金** (gold)：主要按鈕的漸層底、被選中按鈕的外框、重點小圓點。
- **淺書籤金** (gold-light)：金色上的文字、導覽列目前所在分頁的字色、標籤字色。
- **金色暈底** (gold-wash)：標籤（chip）與導覽列目前分頁的底色。

### Tertiary（行情語意色，只表示方向）
- **漲紅** (up-red)：上漲、買超、漲停。
- **跌綠** (down-green)：下跌、賣超、跌停。
- **平盤灰** (flat-grey)：平盤。
- **支撐藍** (support-blue)／**壓力橘** (resistance-orange)：K 線圖上的支撐與壓力線。

### Neutral
- **墨黑** (ink-black)：整頁背景、PWA 主題色。
- **卡片面** (panel)：卡片與表頭底色。
- **浮起面** (panel-raised)：按鈕、輸入框、分段切換底、表格滑過列、浮框。
- **髮絲線** (hairline)：外框與分隔線。
- **紙白** (paper-white)：主要文字；分段切換被選中時的底色。
- **次要灰** (text-secondary)：副標、說明文字。
- **淡灰** (text-dim)：表頭、最次要的資訊。

### Named Rules
**紅綠只說漲跌。** 漲紅、跌綠只能表示行情方向（漲跌、買賣超），不可用在警告、成功訊息、按鈕或裝飾；台股紅漲綠跌的慣例絕不反轉。

**金色是書籤。** 金色只標使用者正在看或該回頭看的地方（選中狀態、主要動作、重點標籤），不鋪大面積底色。

## Typography

**Display Font:** Noto Serif TC（備用 Songti TC, serif）
**Body Font:** IBM Plex Sans（中文接 Noto Sans TC、PingFang TC、Microsoft JhengHei）
**Label/Mono Font:** IBM Plex Mono（等寬數字 tabular-nums）

**Character:** 襯線標題帶出「研究筆記」的書卷感，無襯線內文與等寬數字負責效率與對齊。

### Hierarchy
- **Page title**（700，約 18px，字距 0.03em，襯線）：各頁 h1。
- **Card title**（600，14px，字距 0.04em，襯線）：卡片頂端標題列；標題列裡的按鈕與副標回到無襯線、不加字距。
- **Body**（400，13px）：全站基準字級，表格、清單、說明。
- **Label**（400，12px，次要灰）：副標、表頭、浮框說明（浮框 12px、行高寬鬆）。
- **Numeric**（等寬 Plex Mono，tabular-nums）：價格、漲跌幅、張數、金額，一律用 `.mono`。

### Named Rules
**數字一律等寬。** 任何會上下比較的數字都用 IBM Plex Mono 的等寬數字，欄位右對齊。

**襯線只給標題。** Noto Serif TC 只用在頁面標題與卡片標題，不用在內文、按鈕或數字。

## Layout

- 內容最寬 1440px 置中，左右留白 12px（手機）／16px（sm 以上），上下 16px。
- 頁面由卡片組成，首頁卡片可拖曳排序，同一列卡片等高。
- 表格儲存格內距 6px × 10px，第一欄靠左、其餘靠右，表頭黏在卡片頂端。
- 導覽列是一排可橫向捲動的膠囊群組，群組展開成下拉選單；寬度不夠時出現左右箭頭。
- 高密度優先：桌機盤中看盤是主要情境，手機以橫向捲動與堆疊補足。

## Elevation & Depth

以色階分層為主、陰影為輔：墨黑底 → 卡片面 → 浮起面，越上層越亮。卡片另外帶一條頂邊微亮線與柔和落影，讓它像一張放在桌上的卡紙。

### Shadow Vocabulary
- **卡片** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 4px 14px rgba(0,0,0,.32)`)：所有 `.card`。
- **浮框／下拉選單**（較深的 `shadow-lg`）：說明浮框、導覽下拉。

## Shapes

圓潤但不幼稚：卡片 22px 大圓角，按鈕、分段切換、導覽分頁都是膠囊形；標籤 6px 小圓角；表格與輸入框幾乎是直角（4px），讓資料區保持俐落。

## Components

### Buttons
- **Shape:** 膠囊形（999px）。
- **Default:** 浮起面底、髮絲線外框、紙白字，內距 6px × 12px，13px。
- **Hover:** 外框變淡灰。
- **Gold（主要動作）:** 由淺書籤金到書籤金的直向漸層、深色字、600 字重、無外框。
- **On（被選中）:** 外框變書籤金、字變淺書籤金。
- **Disabled:** 40% 透明度。

### Segmented control
- 浮起面膠囊底、3px 內距；選項 13px 次要灰字，被選中的選項是紙白底、黑字、600。

### Chips
- 金色暈底、淺書籤金字、6px 圓角、12px 字。用於訊號標籤、分類標記。

### Cards / Containers
- **Corner Style:** 22px。
- **Background:** 卡片面。
- **Shadow Strategy:** 見 Elevation 的「卡片」陰影。
- **Border:** 透明 1px（保留位置，不畫線）。
- **Internal Padding:** 標題列 14px 16px 8px。

### Inputs / Fields
- 浮起面底、髮絲線外框、4px 圓角、12–15px 字；數字輸入用等寬字。編輯中可改用書籤金外框。

### Navigation
- 頂部一排膠囊群組（市場／排行／自選／個股／籌碼／選股），13px 次要灰字；目前所在群組是金色暈底＋淺書籤金字，並在群組名後附「· 子頁名」。下拉選單項目 13.5px，選中項目為淺書籤金字。

### 術語說明（Signature）
- 名詞加虛線底線，或放圓圈問號；滑過顯示 256px 寬的浮框（浮起面底、髮絲線外框、12px 次要灰字），自動避開畫面邊緣。

## Do's and Don'ts

### Do:
- **Do** 用漲紅 #f2554f 表示上漲、跌綠 #22b573 表示下跌，全站一致。
- **Do** 把所有可比較的數字放進等寬字欄位並右對齊。
- **Do** 卡片標題用襯線字，標題列裡的按鈕與副標回到無襯線。
- **Do** 遇到專有名詞時，用虛線底線或問號浮框就地說明。
- **Do** 動畫遵守 `prefers-reduced-motion`（跑馬燈、河道光點已這樣做）。

### Don't:
- **Don't** 做淺色主題或淺色底的頁面。
- **Don't** 把紅綠用在漲跌以外的意思，或反轉成綠漲紅跌。
- **Don't** 用金色鋪大面積底色；它是書籤，不是背景。
- **Don't** 為了簡潔刪掉老手需要的資料欄位；用說明浮框補，不用刪減補。
