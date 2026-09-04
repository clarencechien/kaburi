# Kaburi — 檔案類型（草稿，待討論）

接續交接文件與 phase 2。本文件規格化「Kaburi 認得哪些檔案、怎麼呈現、怎麼改名」。

> **狀態：已實作。** 這份文件保留為當初的決定與理由；實際行為見 `README.md` 的「檔案類型」一節。

---

## 1. 為什麼要動

現在 `kindOf()` 回 `null` 就等於「這個檔不存在」，而它同時被四個地方當守門員：

| 位置 | 現在的後果 |
|---|---|
| `validName()` | 改名成 `.json` 被擋 |
| `scan()` | 資料夾裡現成的 `.json` 不會出現在檯面上 |
| `safeName()` | 分享進來的 `data.json` 變成 `data.json.md` |
| `.cut.<kind>` | 沒有色帶 |

而且 `kind` 混了兩件事：**識別**（算不算數、什麼顏色）與**呈現**（哪個 renderer、預設進 view 還是 edit）。三種類型時剛好一對一，加第四種就崩。

現存的證據：**`.txt` 切到 view 時是走 markdown renderer 的**。平常看不到是因為 txt 預設進 edit，但那顆膠囊按下去就會看到純文字被當 markdown 解析。json 只是把同一個問題放大。

## 2. 目標與非目標

### 目標

1. 收 `json` / `csv` / `yaml` / `log`，加上既有的 `md` / `html` / `txt`。
2. 把識別與呈現拆開，加一個類型是**改一行表**，不是改四個地方。
3. `json` / `csv` 在 view 模式有真正的呈現（pretty / 表格）。
4. `txt` / `log` 有一個「純」的 view renderer，順手修掉 txt 被 markdown 吃掉的 bug。

### 非目標

- **不做語法檢查。** 不驗證、不報行號。render 失敗就退回純文字讓使用者自己改。
- **不做格式化按鈕。** 不提供「整理 json 縮排」這種會改動內容的動作。
- **不做多色語法高亮**（每種 token 各一個顏色）。那是呈現，屬於 SnapDeck。**只用單一強調色（螢光綠 `--neon`）標出「值」**——json 的純量、csv 的數字欄、yaml 冒號後面的部分。一個顏色是強調，一整套配色才是高亮，界線劃在這裡。
- **不收第二級類型**（`.sql` `.sh` `.py` `.js` `.xml`）。收了下一步就是要語法高亮，定位會滑掉。
- **不收 `.svg`。** 它是可執行的容器，inline 渲染就是 XSS；要收只能當純文字或走 `sandbox=""`，不值得。
- **不收二進位**（pdf、圖片）。理由見 §3。

## 3. 白名單的職責重新定義

白名單不是「我們支援哪些格式」，是「**存回去不會毀掉的檔案**」。

`save()` 是把字串寫回去的。二進位檔被當文字讀進來會變亂碼，存回去就永久毀了——那正是交接文件 §5.1 說的「唯一會讓使用者損失資料的地方」那一類。所以白名單是安全機制，不是品味問題，這也讓界線有客觀依據。

## 4. 資料結構：一張表取代 `kindOf`

```js
/* 副檔名 → {class 色帶類別, view 呈現方式, open 預設模式} */
var TYPES = {
  md:       {class: "doc",   view: "markdown", open: "view"},
  markdown: {class: "doc",   view: "markdown", open: "view"},
  html:     {class: "page",  view: "sandbox",  open: "view"},
  htm:      {class: "page",  view: "sandbox",  open: "view"},
  txt:      {class: "plain", view: "plain",    open: "edit"},
  log:      {class: "plain", view: "plain",    open: "edit"},
  json:     {class: "data",  view: "json",     open: "view"},
  csv:      {class: "data",  view: "table",    open: "view"},
  yaml:     {class: "data",  view: "plain",    open: "view", tint: "yaml"},
  yml:      {class: "data",  view: "plain",    open: "view", tint: "yaml"},
};
function typeOf(name) {
  var m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? (TYPES[m[1].toLowerCase()] || null) : null;
}
```

`typeOf()` 回 `null` 的意義維持不變（不算數），但現在只有一個地方定義，且回傳的是一筆記錄而不是一個字串。

**預設模式的規則不是逐一挑的，是推導出來的**：view 的產出跟原始碼**明顯不同**就進 view，一樣就進 edit。所以 md / html / json / csv / yaml 進 view，txt / log 進 edit。yaml 一開始被歸在 edit，加了逐行上色之後它的 view 就不再等同原始碼，依同一條規則改為 view——**規則沒有例外，是輸入變了**。這條規則讓以後加類型不用再吵。

## 5. 四個 renderer

| view | 用於 | 作法 |
|---|---|---|
| `markdown` | md | 現有的 `md()`，不動 |
| `sandbox` | html | 現有的 `srcdoc` + `sandbox=""`，不動 |
| `plain` | txt、log | **新增。** `<pre>` 保留縮排與換行，等寬字。不解析任何語法 |
| `plain` + tint | yaml | **新增。** 同上，另外逐行用正則切出 key／值／註解／清單符號各自上色。**不解析結構**，所以對 anchor、多行純量、flow 風格永遠不會給出錯誤的判讀；也不更動任何一個字元 |
| `json` | json | **新增。** `JSON.parse` → 遞迴建樹，物件與陣列用 `<details>` 可折疊，純量上強調色 |
| `table` | csv | **新增。** 解析成列，表頭可勾，數值欄靠右並上強調色（逐欄推論，見 §5.4），重用 `.read table` 樣式 |

### 5.1 render 失敗的行為（§2 的「不檢查」怎麼落地）

`json` 與 `table` 失敗時：**退回 `plain` 呈現原始內容，並在上方顯示一條提示條**（重用 html 預覽那個 `.strip` 元件）。

- 不報行號、不標紅、不擋存檔
- 提示條只說「這份 JSON 解析不了，先看原始內容」，使用者自己切 edit 去改
- 這樣「不做語法檢查」與「view 要 render」兩個決定不衝突：render 是服務，不是驗證

### 5.2 節點上限

`json` 超過 4000 個節點、`csv` 超過 4000 個儲存格時**退回文字並顯示提示條**。1 MB 的深層 json 展開會產生十萬個以上的 DOM 節點，手機扛不住；上限讓最壞情況有界。

### 5.4 數值欄的判定

**逐欄不逐格**：一欄裡非空的格子全部都是數字，那一欄才算數值欄。逐格判斷會讓文字欄裡偶然出現的一個數字單獨跳色又靠右，在一欄文字中看起來像壞掉；試算表與 pandas 也都是逐欄推論。

**開頭是 0 的不算數值**：`007`、`0912345678` 是代碼不是數量，右對齊會誤導。`0.5` 不受影響（規則是 `/^-?0\d/` 才排除）。

日期與布林值不上色。要上色就得再給一個顏色，或讓它們與數字同色——前者變成多色配色（§2 的非目標），後者讓「綠色 = 數量」這個訊號變模糊。

### 5.3 CSV 解析範圍

最小可用：支援雙引號包住的欄位（欄位內可含逗號、換行、跳脫的引號）、CRLF、BOM。

- 欄數不齊的列**照原樣呈現**，不補空欄也不報錯
- 第一列是否當表頭由勾選框決定（§12）

## 6. 色帶

色帶綁 **class 不綁副檔名**，這樣顏色的語意是「這是什麼東西」而不是「這是什麼副檔名」。

| class | 顏色 | 類型 |
|---|---|---|
| `doc` | `--maguro` 鮪紅 | md |
| `page` | `--sake` 鮭橙 | html |
| `plain` | `--ika` 烏賊白 | txt、log |
| `data` | `--tamago` 玉子黃（**新增**） | json、csv、yaml |
| `other` | 保留（中性色） | 目前沒有；供以後加類型用，不必重挑顏色 |

CSS class 從 `.cut.md` 等改為 `.cut.doc` / `.page` / `.plain` / `.data`。`--tamago` 需要暗亮兩個主題各一個值，並與現有三色在兩個主題下都分得開。

## 7. 改名、新建、分享

### 7.1 改名（本次的起因）

`validName()` 改用 `typeOf()`，所以 `.json` / `.csv` / `.yaml` / `.log` 都改得動。其餘規則不變（不能有斜線、不能以點開頭、大小寫同檔的保護照舊）。

**改名跨類型時**：`f.kind` 與色帶跟著換，`render()` 重跑；但**不強制切換 view/edit 模式**——正在編輯的人不該被拉走。

### 7.2 新建

`+` 維持只建 `untitled.md`。交接文件 §4.6：「不做類型下拉，副檔名就是類型選擇器」。要 json 就改名——這正好需要 §7.1 的修正，兩件事是一致的。

### 7.3 分享落檔

`safeName()` 的補副檔名邏輯改用 `typeOf()`：白名單內就原樣保留，白名單外才補 `.md`。修掉 `data.json` → `data.json.md`。

## 8. manifest（兩處，容易漏）

`file_handlers.accept` 與 `share_target.params.files.accept` **兩邊都要加**，否則 OS 的「開啟方式」與分享選單不會出現 Kaburi。

| 類型 | MIME | 副檔名 |
|---|---|---|
| json | `application/json` | `.json` |
| csv | `text/csv` | `.csv` |
| yaml | `application/yaml`（RFC 9512） | `.yaml` `.yml` |
| log | `text/plain` | `.log` |

副檔名那一欄是可靠的部分；Android 對 `.yaml` / `.log` 不一定有 MIME 對應，別只靠 MIME。

## 9. 安全

- **不新增任何 `innerHTML` 路徑。** `plain`、`json`、`table` 三個 renderer 一律用 `document.createElement` + `textContent` 建 DOM。目前只有 markdown renderer 用 `innerHTML`，它自己會跳脫，這個現況不能被打破
- **`app.js:310` 的色帶是塞進 `innerHTML` 的**（`'<span class="cut ' + f.kind + '">'`）。改成 `type.class` 之後，那個值**必須永遠來自寫死的封閉集合**，不能有任何路徑讓檔名影響它
- CSV 的儲存格內容是不受信任的（檔案可能是下載來的），一律 `textContent`
- html 的 `sandbox=""` 不變，`allow-scripts` 與 `allow-same-origin` 永遠不能同時給
- 新類型不改 CSP，不新增外部請求

## 10. 測試（`scripts/check.cjs`）

- 每個新副檔名各建一個檔，確認出現在檯面、色帶 class 正確
- 改名：`.md` → `.json` / `.csv` / `.yaml` / `.log` 都成功且磁碟上真的變了
- render：json pretty、csv 表格、txt/log 純文字（**確認縮排沒被吃掉、`#` 沒變成標題**）
- render 失敗：壞掉的 json 退回純文字並顯示提示條，且仍可切 edit 存檔
- 分享落檔：`data.json` 落地就是 `data.json`，不是 `data.json.md`
- 大檔：造一個 >1 MB 的檔，確認不開、toast 出現、該列仍在檯面上
- 編碼：寫一個含 Big5 位元組的 `.log`，確認提示條出現、膠囊停用、Save 進不去，且 `Ctrl+S` 也沒用
- BOM：開一個帶 BOM 的 csv，不改內容直接存，確認**位元組完全相同**
- CRLF：開一個 CRLF 的 log，不改內容直接存，確認**位元組完全相同**
- CSV 表頭：勾選框切換時表格重畫，不重讀檔案
- 版面：`plain` 與 `json` 在 412 寬度不產生水平捲軸（既有的四寬度斷言要繼續綠）
- 既有 56 條全部要繼續綠

## 11. 已決定

| 項目 | 決定 |
|---|---|
| `other` | **(a) 保留色**。白名單內、不屬於四類的類型用的中性色。白名單外的檔案維持不上檯（那是獨立 feature，不混進來） |
| yaml 的 view | **`plain`**。不內嵌 YAML parser |
| `.tsv` | **不收**。維持 json / csv / yaml / log |
| 編碼 | **只做 UTF-8**。不合的給 view + 警語，Save 停用（§15） |
| CSV 表頭 | **一個勾選框**，勾了第一列當表頭。位置與狀態見 §12 |
| 大檔 | **超過 1 MB 就不開**。見 §13 |

## 12. CSV 表頭勾選框

**位置**：放在 view 模式表格的**上方**，不放工具列。工具列已有返回／檔名／view-edit／Save 四件，手機 412 寬長檔名還會折成兩行，再加第五件會擠爆。

**狀態存哪**：`localStorage` 的 `kaburi.csvHeader`，預設**開**（多數 CSV 有表頭），與 theme / lang 同一類的介面偏好。

> 替代方案是逐檔記憶（像 `kaburi.stowed` 那樣的對照表），UX 較好但會長出第三張需要清理的表，而且表頭旗標沒有 mtime 那種天然的失效條件。先做全域，不夠再說。

## 13. 大檔：超過 1 MB 不開

在 `openFile()` 一開始擋，用 `scan()` 剛抓到的 `f.size`：

- 超過就**不開 stage**，用 toast 說明；**該列仍留在檯面上**（你要看得到它存在）
- 規則對**所有類型一致**，包含既有的 md / html / txt——比逐類型的門檻好解釋
- 這會改變既有行為：現在一份 2 MB 的 md 開得起來，之後不行。以目前的使用情境（草模種子資料最大 210 KB）1 MB 有很大餘裕

## 14. 需要改的地方（完整清單）

`kindOf` / `f.kind` 的每一個使用點都在這裡，一個都不能漏：

| 位置 | 現在 | 要變成 |
|---|---|---|
| `app.js:150` | `kindOf()` 回字串 | `typeOf()` 回記錄 |
| `app.js:165` | `scan()` 過濾 | 用 `typeOf()` |
| `app.js:310` | `.cut ' + f.kind` 塞進 `innerHTML` | 改塞 `type.class`，**必須維持封閉集合**（見 §9） |
| `app.js:433` | `f.kind === "txt" ? "edit" : "view"` | 用 `type.open` |
| `app.js:462` | `f.kind === "html"` | 用 `type.view` 分派四個 renderer |
| `app.js:478` | `validName()` | 用 `typeOf()` |
| `app.js:534` | `renameFile()` 更新 `f.kind` | 更新為記錄 |
| `app.js:674` | `safeName()` 補 `.md` | 白名單內原樣保留 |
| **`app.js:803`** | **`bindLaunchQueue()` 的 `kindOf(h.name) \|\| "txt"`** | **容易漏。OS「開啟方式」進來的檔案也要走同一張表** |
| `app.css:180-182` | `.cut.md/.html/.txt` | `.cut.doc/.page/.plain/.data/.other` |
| `manifest.json` | 兩份 accept | 見 §8 |

### 14.1 新增的文案（en / zh 各一）

- 解析失敗的提示條
- CSV 表頭勾選框的標籤
- 超過 1 MB 的 toast
- 非 UTF-8 的提示條

### 14.2 文件

`README.md` 的「檔案」一節與資安基線要同步更新：白名單的新職責（存回去不會毀掉的檔案）、四個 renderer、只支援 UTF-8。

## 15. 編碼：只做 UTF-8，不合的給 view 與警語

`file.text()` 一律以 UTF-8 解碼，遇到不合法的位元組會換成 U+FFFD（`�`）。**存回去就是把原本的位元組永久換成問號**——跟白名單要防的是同一種傷害。台灣環境裡 Windows 工具產出的 `.log` 有相當機率是 Big5，加了 `.log` 之後命中率大幅上升。

**決定：只支援 UTF-8。不合的檔案顯示提示條、只給 view、Save 停用。**

### 15.1 偵測方式：`TextDecoder` 的 fatal 模式，不要掃 U+FFFD

```js
var buf = await file.arrayBuffer();
try {
  body = new TextDecoder("utf-8", {fatal: true}).decode(buf);   // 合法
} catch (e) {
  body = new TextDecoder("utf-8").decode(buf);                  // 有損，只給看
  readonly = true;
}
```

掃 `\uFFFD` 會誤判——合法的 UTF-8 檔案本來就可以包含真正的 U+FFFD 字元。fatal 模式由解碼器判斷位元組序列本身合不合法，沒有偽陽性。

代價是改讀 `arrayBuffer()` 而不是 `text()`，多一步而已。

### 15.2 唯讀狀態的行為

- 進 view，**view/edit 膠囊停用**（不是只把 Save 藏起來——不能讓人打了半天字才發現存不回去）
- `save()` 一開頭檢查旗標就退出，`Ctrl+S` 也走同一條路
- 提示條說明「這個檔不是 UTF-8，只能看」

### 15.3 順序

大小檢查（§13）在讀取之前，所以超過 1 MB 的檔案不會先被讀成 ArrayBuffer 才被拒絕。

## 15A. 同一家族的兩個問題：BOM 與換行

編碼那題揭開的是一個更廣的原則：**開檔再存檔，不該改動使用者沒改的位元組**。有兩個地方現在會違反它，而新類型讓命中率大幅上升。

### 15A.1 BOM 會被吃掉

`TextDecoder`（與 `file.text()`）預設會剝掉開頭的 UTF-8 BOM。存回去時字串裡沒有 BOM，**檔案就被改了，即使你一個字都沒動**。

Excel 產出的 CSV 幾乎都帶 BOM，所以收了 `.csv` 之後這條路徑很容易被踩到。

**建議做法**：讀取時記下 `f.bom = true`，寫回時把 BOM 補回去。不要改用 `ignoreBOM: true` 讓它留在字串裡——那樣 BOM 會變成編輯區開頭一個看不見的字元，而且 `JSON.parse` 遇到開頭的 BOM 會直接失敗。

### 15A.2 CRLF 會被換成 LF

`<textarea>` 依 HTML 規格會把換行正規化成 LF。所以開一個 CRLF 的檔案再存，**整份檔案的每一行結尾都被改掉**——內容沒壞，但版本控制上是全檔差異，對 log 與 csv 特別惱人。

Windows 工具產出的 `.log` 與 `.csv` 常見 CRLF。

**建議做法**：讀取時判斷主要換行樣式記成 `f.eol`，寫回時轉回去。約五行。

> 這兩項都是既有 md / txt 就有的行為，只是加了 csv / log 之後才會被經常踩到。我照你在編碼那題確立的原則（存回去不該毀掉或改掉檔案）直接寫進規格，**如果你認為不值得做，說一聲我拿掉**。

## 16. 版面：`plain` 不能產生水平捲軸

既有測試會在四種寬度斷言 `scrollWidth === innerWidth`。`<pre>` 預設不換行，長行會撐破頁面把那條測試打掉。

- `plain` 與 `json`：`white-space: pre-wrap; word-break: break-word`，不產生水平捲軸
- `table`：沿用 `.read table` 的 `display:block; overflow-x:auto`，捲軸關在自己的盒子裡
- `plain` 用自己的 class，不要沿用 `.read pre`（那是 markdown 程式碼區塊的樣式，語意不同）

## 17. 已知限制（不做，但要記著）

- **副檔名說謊**：把 `photo.png` 改名成 `photo.txt` 就能繞過白名單，開起來是亂碼，存檔會毀掉。使用者要主動誤操作才會發生，不另外偵測
- **`.log` 的實際格式**沒有標準，我們只當它是純文字

## 18. 實作結果

全數實作，測試從 56 條增加到 83 條。BOM 與 CRLF 兩項未被否決，一併做了。
