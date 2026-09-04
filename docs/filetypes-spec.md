# Kaburi — 檔案類型（草稿，待討論）

接續交接文件與 phase 2。本文件規格化「Kaburi 認得哪些檔案、怎麼呈現、怎麼改名」。

> **狀態：草稿。** §11 有尚未決定的項目，決定完才動手。

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
- **不做語法高亮。** 那是呈現，屬於 SnapDeck。
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
  yaml:     {class: "data",  view: "plain",    open: "edit"},   // §11.2
  yml:      {class: "data",  view: "plain",    open: "edit"},   // §11.2
};
function typeOf(name) {
  var m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? (TYPES[m[1].toLowerCase()] || null) : null;
}
```

`typeOf()` 回 `null` 的意義維持不變（不算數），但現在只有一個地方定義，且回傳的是一筆記錄而不是一個字串。

**預設模式的規則不是逐一挑的，是推導出來的**：view 的產出跟原始碼**明顯不同**就進 view，一樣就進 edit。所以 md / html / json / csv 進 view，txt / log / yaml 進 edit。這條規則讓以後加類型不用再吵。

## 5. 四個 renderer

| view | 用於 | 作法 |
|---|---|---|
| `markdown` | md | 現有的 `md()`，不動 |
| `sandbox` | html | 現有的 `srcdoc` + `sandbox=""`，不動 |
| `plain` | txt、log、yaml | **新增。** `<pre>` 保留縮排與換行，等寬字，用 `.read` 的字級與行高。不解析任何語法 |
| `json` | json | **新增。** `JSON.parse` → `JSON.stringify(x, null, 2)` → 丟給 `plain` 呈現 |
| `table` | csv | **新增。** 解析成列，第一列當表頭，重用現有的 `.read table` 樣式 |

### 5.1 render 失敗的行為（§2 的「不檢查」怎麼落地）

`json` 與 `table` 失敗時：**退回 `plain` 呈現原始內容，並在上方顯示一條提示條**（重用 html 預覽那個 `.strip` 元件）。

- 不報行號、不標紅、不擋存檔
- 提示條只說「這份 JSON 解析不了，先看原始內容」，使用者自己切 edit 去改
- 這樣「不做語法檢查」與「view 要 render」兩個決定不衝突：render 是服務，不是驗證

### 5.2 CSV 解析範圍

最小可用：支援雙引號包住的欄位（欄位內可含逗號、換行、跳脫的引號）、CRLF、BOM。

- 欄數不齊的列**照原樣呈現**，不補空欄也不報錯
- 第一列一律當表頭（§11.3）

## 6. 色帶

色帶綁 **class 不綁副檔名**，這樣顏色的語意是「這是什麼東西」而不是「這是什麼副檔名」。

| class | 顏色 | 類型 |
|---|---|---|
| `doc` | `--maguro` 鮪紅 | md |
| `page` | `--sake` 鮭橙 | html |
| `plain` | `--ika` 烏賊白 | txt、log |
| `data` | `--tamago` 玉子黃（**新增**） | json、csv、yaml |
| `other` | 待決（§11.1） | 待決 |

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
- CSV 的儲存格內容是不受信任的（檔案可能是下載來的），一律 `textContent`
- html 的 `sandbox=""` 不變，`allow-scripts` 與 `allow-same-origin` 永遠不能同時給
- 新類型不改 CSP，不新增外部請求

## 10. 測試（`scripts/check.cjs`）

- 每個新副檔名各建一個檔，確認出現在檯面、色帶 class 正確
- 改名：`.md` → `.json` / `.csv` / `.yaml` / `.log` 都成功且磁碟上真的變了
- render：json pretty、csv 表格、txt/log 純文字（**確認縮排沒被吃掉、`#` 沒變成標題**）
- render 失敗：壞掉的 json 退回純文字並顯示提示條，且仍可切 edit 存檔
- 分享落檔：`data.json` 落地就是 `data.json`，不是 `data.json.md`
- 既有 56 條全部要繼續綠

## 11. 待決

### 11.1 `other` 是什麼

你說「白名單，tamago 是資料類，然後還有一個其他」。兩種讀法差很多：

- **(a) 保留色**：白名單內、但不屬於四類的類型用的中性色。以後加類型不用重挑顏色。**改動小。**
- **(b) 白名單外的檔案也上檯，但變灰、唯讀**：檯面不再對資料夾說謊，你看得到 `.pdf` 在那裡，只是開不了。**但這讓 Kaburi 往檔案管理器靠**，而交接文件明說不做。而且檯面只留最近五筆，一個 Downloads 資料夾會被雜訊塞爆。

我傾向 (a)。要 (b) 的話它是獨立的一個 feature，不該混在這次。

### 11.2 yaml 的 view 要 pretty 到什麼程度

你說 json/yaml/csv 都要 pretty。json 和 csv 都便宜（原生 API、三十行解析器），**但 yaml 沒有原生解析器**，要真的 pretty 就得把一個 YAML parser 內嵌進 `app.js`（CSP 是 `script-src 'self'`，不能載外部函式庫）。那是好幾百行、且 YAML 的邊角案例很多。

我的建議：**yaml 用 `plain`**。YAML 本來就是設計成人可讀的，已經有縮排，pretty 化能加的價值很低，不值得那個體積與風險。上表暫時照這個寫。你若堅持要 parse，那是獨立一個 phase。

### 11.3 CSV 的第一列一定是表頭嗎

有些 log 匯出的 CSV 沒有表頭，第一列當表頭會少一筆資料。選項：一律當表頭（簡單、可預期）／偵測（會猜錯）。我傾向一律當表頭，因為猜錯比固定規則更難解釋。

### 11.4 `.tsv` 收不收

你列的是 csv，但 tsv 是它的雙胞胎，解析器只差一個分隔字元。順手收還是維持你列的清單？

### 11.5 大檔的上限

現在沒有任何大小保護。一個 10 MB 的 log 走 `plain` 還好，但 CSV 建成表格會產生幾十萬個 DOM 節點，手機會當掉。

建議：超過某個門檻（例如 1 MB）時 `table` 與 `json` 自動退回 `plain` 並顯示提示條。門檻要多少、或要不要做，你決定。
