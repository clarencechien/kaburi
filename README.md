# Kaburi

處理生魚片的工作檯。開一個固定資料夾裡的 md / html / txt，看、改、改名、存回原檔，再滑掉。

- 正式站：`https://kaburi.ai-apps.work`
- 純靜態 PWA，沒有 build step。站台檔案全在 [`public/`](public/)，跑在 Cloudflare Workers static assets 上。
- 規格與設計理由見交接文件；版面、互動、文案以草模為準。

## 檔案

```
public/
  index.html          殼
  boot.js             同步跑在 <head>：主題 / 語言 / 佈局，以及 *.workers.dev / *.pages.dev → 正式網域
  app.js              全部邏輯：類型表、資料夾把手、列表、stage、改名、便條
  app.css             三層深度、app / tablet 兩種佈局
  manifest.json       file_handlers 與 share_target 在這裡；display_override 開 window-controls-overlay
  sw.js               離線殼（先抓網路、斷網才用快取，只有 text/html 能當殼）＋ share target：攔 POST /share
  icon-*.png          由 scripts/icons.cjs 產生
  _headers            回應標頭（CSP、HSTS、noindex…），Workers static assets 會讀
  robots.txt          Disallow all
wrangler.jsonc        Workers 設定：assets 目錄、關 workers.dev、custom domain
scripts/
  icons.cjs           用 Chromium 畫 icon
  check.cjs           起本機伺服器（帶 _headers）＋第二個來源的伺服器、用 OPFS 假資料夾跑完整流程、截四種寬度
```

## 部署：Cloudflare Workers 接 GitHub

專案在 dashboard 以 **Workers & Pages → Create → Import a repository** 建立，設定全在 [`wrangler.jsonc`](wrangler.jsonc)：

- 沒有 Worker 程式碼，`assets.directory` 指向 `public/`，整個站是靜態檔案。
- push 到 `main` 跑 `wrangler deploy`，其他分支跑 `wrangler versions upload`（只上傳版本，不切流量）。
- `workers_dev: false`、`preview_urls: false`：`*.workers.dev` 與 Preview URL 一律關閉。
- `routes` 宣告 `kaburi.ai-apps.work` 為 custom domain，zone 要在同一個帳號，deploy 時會自動建 DNS 與憑證。

dashboard 的 Build 設定用預設值即可（Build command 留空，Deploy command 預設）。

## 資安基線

- **Cloudflare 自己的 hostname 不當前門**：`wrangler.jsonc` 關掉 `workers.dev` 與 Preview URL；`boot.js` 第一行再擋一次，任何 `*.workers.dev` / `*.pages.dev` 都轉到正式網域。
- **`_headers`**：CSP（`script-src 'self'`，沒有 inline script）、`frame-ancestors 'none'`、HSTS、`nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy` 關掉相機／麥克風／定位、`X-Robots-Tag: noindex`。
- **只有 markdown renderer 用 `innerHTML`**，它自己會跳脫；`plain` / `json` / `table` 三個 renderer 一律 `textContent`。列表色帶的 class 也是塞進 `innerHTML` 的，那個值必須永遠來自寫死的 `TYPES` 表
- **HTML 預覽** 走 `srcdoc` + `sandbox=""`。CSP 會被 iframe 繼承，所以預覽裡的 script、外部圖片、外部 CSS 全部不會跑。`allow-scripts` 與 `allow-same-origin` 永遠不能同時給。
- 沒有後端、沒有 analytics、沒有第三方資源。偏好（主題、語言、下檯清單）在 `localStorage`，資料夾把手在 IndexedDB，便條只在記憶體。

## 檔案類型

一張表決定一切（`app.js` 的 `TYPES`）。加一個類型是加一行，不是改十一個地方。

| 副檔名 | 色帶 | view | 開啟時 |
|---|---|---|---|
| `.md` `.markdown` | 鮪紅 `--maguro` | markdown | view |
| `.html` `.htm` | 鮭橙 `--sake` | `sandbox=""` iframe | view |
| `.json` | 玉子黃 `--tamago` | 樹狀結構，物件與陣列可折疊 | view |
| `.csv` | 玉子黃 | 表格，表頭可勾、數字欄靠右 | view |
| `.yaml` `.yml` | 玉子黃 | 純文字加逐行上色 | edit |
| `.txt` `.log` | 烏賊白 `--ika` | 純文字 | edit |

**預設模式是推導的不是挑的**：view 的產出跟原始碼明顯不同就進 view，一樣就進 edit。所以以後加類型不用再吵。

**白名單的職責是「存回去不會毀掉的檔案」**，不是「我們支援哪些格式」。`save()` 是把字串寫回去的，二進位檔被當文字讀進來再存回去就永久毀了。這讓界線有客觀依據。

- **只支援 UTF-8。** 用 `TextDecoder` 的 fatal 模式判斷（不是掃 `\uFFFD`，那會誤判合法檔案裡真正的 U+FFFD）。不合的檔案顯示提示條、只給 view、**連 view/edit 膠囊一起停用**——不能讓人打了半天字才發現存不回去
- **開檔再存檔不改動使用者沒改的位元組。** BOM 會被解碼器剝掉、CRLF 會被 `<textarea>` 正規化成 LF，兩者都記下來在寫回時還原。驗收方式是「不改內容直接存，位元組完全相同」
- **超過 1 MB 不開。** 規則對所有類型一致，該列仍留在檯面上
- json / csv 解析失敗就退回純文字加一條提示，不驗證、不報行號、不擋存檔。render 是服務不是驗證
- **只有一個強調色。** 螢光綠 `--neon` 標出「值」：json 的純量、csv 的數字欄、yaml 冒號後面的部分。key 與標點保持安靜。一個顏色是強調，一整套 token 配色才是語法高亮，後者屬於 SnapDeck
- **yaml 只逐行上色，不解析結構。** 所以它對 anchor、多行純量、flow 風格永遠不會給出錯誤的判讀——它從不宣稱懂結構。上色也不更動任何一個字元
- 節點太多（json 超過 4000 個、csv 超過 4000 個儲存格）就退回文字，避免手機被十萬個 DOM 節點拖垮
- 不收 `.svg`（可執行的容器）、二進位、以及 `.sql` `.sh` `.py` 這類——收了下一步就是要語法高亮，定位會滑掉

規格與被否決的選項見 [`docs/filetypes-spec.md`](docs/filetypes-spec.md)。

## Share target（phase 2）

安裝成 PWA 後出現在系統分享選單，只接 md / html / txt 與純文字。

- 檔案 → 寫進工作資料夾、出現在檯面最上面，不自動開啟。同名自動加 `-2`，不跳確認框。
- 純文字／網址 → 開一張便條，切到便條分頁，不落地。
- 流程：SW 攔 `POST /share`（只認導覽式請求），產生一組不可猜的 token 一併寫進 payload，303 到 `/?share-target=<token>`；前景 `handleShare()` 只有在網址帶的 token 與 payload 裡的相符時才取用，分流、清 cache、把網址洗回 `/`。任何其他啟動看到殘留就直接丟掉，不會留著等人來取。
- 權限：在安裝的 app 視窗裡（standalone）且資料夾權限還在就直接落，零點擊；權限不在就出現「存到 資料夾」橫幅，點一下才寫；完全沒選過資料夾則橫幅改「選一個工作資料夾」，選完接著落。等待期間 cache 保留。
- **兩道防線擋跨站 POST**：任何網站都能用表單 POST 到 `/share`，SW 分不出來源。
  1. **token 綁定**：payload 只能被產生它的那次啟動取用。攻擊者用隱藏 iframe 偷偷寄放（`frame-ancestors 'none'` 會擋掉畫面，但 cache 已經寫進去了），也沒辦法之後誘導使用者開 `/?share-target=1` 把它取出來。
  2. **display-mode 門檻**：真正的分享會開在 app 視窗，跨站 POST 只會落在一般分頁，分頁裡一律要點一下才寫。
  文字便條也走同一道門檻，不會被跨站 POST 直接塞進來。
- 檔名消毒 `safeName()`：去路徑、去控制字元與 `<>:"|?*`、截 120 字、沒副檔名或非 md/html/txt 補 `.md`，拿不到檔名用 `shared-YYYYMMDD-HHmm.md`。
- 本機 `check` 用假資料夾走過分流、尾碼、消毒、清理、重整不重複、無資料夾等待，並用第二個來源的伺服器真的發動一次跨站表單 POST，確認 payload 只落在橫幅上、token 不符會被丟掉；中文檔名在 header 的 encode/decode 有驗。headless Linux Chromium 的 OPFS 開不了中文檔名（TypeMismatchError），是測試環境的怪癖，真實資料夾沒這問題。

## Phase 3 候選：推上 imitator（評估過，沒做）

**想法**：在手機上開了一份 HTML，一鍵推上 [imitator](https://github.com/clarencechien/imitator)（`PUT /v1/a/{slug}`），token 寫在設定裡。

**結論：擋住了，而且卡在 imitator 側，Kaburi 這邊怎麼寫都不會通。**

### 為什麼不通

瀏覽器對跨來源請求會先問目的地伺服器同不同意（CORS preflight）。Kaburi 要送的請求，四個條件裡**任何一個**都會觸發 preflight：`PUT`、`Authorization`、`Content-Type: text/html`、`X-*` 自訂標頭。而 imitator 的 `worker/src/index.js` 對 `/v1/a/{slug}` 只允許 PUT 與 DELETE，其他方法回 `405 Allow: PUT, DELETE`，整份 `worker/src/` 沒有任何 `Access-Control-*`。所以 OPTIONS 拿不到許可，**PUT 根本不會發出去**。

**而且那是刻意的。** imitator 的 `docs/spec.md` §8.5 與 `worker/src/artifacts.js` 的註解都說明：sandbox 過的 artifact 是 opaque origin、送 `Origin: null`，「Worker 不送 CORS header，所以讀不到 response body」——不送 CORS 正是它的隔離手段之一。

curl 可以是因為它只跑你打的那一行，請求可歸責到一個人；瀏覽器同時跑幾千個來源的程式碼且分不出誰可信，所以決定權在伺服器手上。**安裝成 PWA 不改變這件事**：安裝換掉的是視窗、圖示、share target、file handlers，同源政策與 CORS 一個都沒變。

### 為什麼不能只在 Kaburi 這邊解

- `mode: 'no-cors'` 送不了 `Authorization` 與自訂標頭，回應也是 opaque
- 表單 POST 送得出去但同樣帶不了那些標頭、也讀不到回應

### 評估過的六條路

**1. imitator 的 PWA 自己讀檔** ← 目前最好的答案

imitator 的 PWA 用 `showOpenFilePicker()`（或存一份資料夾 handle）選那份 HTML，讀進來，**同源** PUT。

- **Kaburi 一行都不用改。** 檔案早就在磁碟上，imitator 自己去拿
- 沒有任何技術未知，機制也最少：一個檔案選擇器加一次 `fetch`
- 桌機與手機同一套程式碼
- 交接文件反對單檔 handle 的理由是「沒有父目錄，改名會失效」——**imitator 只需要讀，那個理由不成立**
- 代價：動線要切到 imitator 再找檔案，比在 Kaburi 裡順手一按多幾步；Android 上每次重新授權要點一下（跟 Kaburi 一樣）

**2. imitator 變成 share target，Kaburi 用 `navigator.share({files})`**

Kaburi 不發佈，只把檔案交出去；imitator 在自己的來源收下（就是 Kaburi phase 2 那套 SW 攔 POST 的機制），用自己的憑證 PUT。

人因比第 1 條好——你剛看完那個檔，還在情境裡，順手一按就送出。但要多做 manifest share_target、SW 攔 POST、multipart 解析、接收頁，而且**有一個技術未知**：Chrome 對可分享的檔案類型有白名單，要實機驗 `navigator.canShare({files})` 對 `text/html` 是否回 true。

適合當第 1 條做完之後的順手優化，不適合當起點。

**3. imitator 加 CORS 來源白名單**（約 20 行）

只套用在 `/v1/a*`（不碰 `/r/` 與 `/join`）、不用 `*`、**不開 `Access-Control-Allow-Credentials`**、帶 `Vary: Origin`。白名單能保住原本的性質：`Origin: null` 永遠比不中具體來源。代價是 token 要住在 Kaburi 的瀏覽器儲存裡。

**4. Kaburi 長出自己的 Worker**

CORS 問題會完全消失（伺服器到伺服器不受 CORS 約束），而且 imitator 一行都不用改。但 token 放哪裡差很多：

| | 結果 |
|---|---|
| (a) token 留在瀏覽器，Worker 只轉發 | 最糟。風險一個沒少，只是多繞一段。不要 |
| (b) token 放 Worker 的 secret | XSS 與遺失的手機都偷不到憑證。**但 `POST /api/publish` 就變成「用你的 token 發佈」的公開端點——confused deputy**，別人不需要你的 token，借用你的 Worker 就行 |

所以 (b) 一定要做認證，而選項都有代價：瀏覽器存一把 Kaburi 專用 key（又是 token 在瀏覽器，但爆炸半徑只剩「透過我的 Worker 發佈」，不能 LIST／DELETE，輪替也不碰 imitator 那組——合理的折衷）；cookie + magic link（等於重寫 imitator spec §5）；Cloudflare Access 擋 `/api/*`（不用寫程式，但 Access 靠轉址到登入頁，`fetch()` 跟不了互動式轉址，要繞得用 service token，又是 token）。另外那個端點得自己做限速，否則等於把寫入能力放上公開網路。

**代價**：破壞「沒有後端」。那不是裝飾——它是為什麼 CSP 能設 `default-src 'none'`、為什麼整個 app 讀四個檔就能審完。加了之後每一份發佈的 HTML 都會經過自己寫的伺服器程式碼，「不落地」也變模糊。

**5. 什麼都不做**（現在就可用的基準線）

檔案本來就在磁碟上的資料夾裡，任何上傳介面的檔案選擇器都拿得到——imitator 的 `inbox/` 加 GitHub 網頁版在手機上已經能用。缺的只有「一鍵」。**Kaburi 的工作其實已經做完了**，這是評估其他選項時該對照的基準。

**6. 已評估並否決**

- **imitator 的 Chrome 擴充功能**：原理完全成立，宣告 `host_permissions` 的擴充功能其 `fetch()` **豁免 CORS**——理由跟 curl 一樣，安裝時明確授權過，請求可歸責。token 放 `chrome.storage` 也比 `localStorage` 隔離得好。但**Android 版 Chrome 沒有擴充功能**，而動機情境正是手機；它解決的是桌機，而桌機本來就能用 curl。（Firefox Android 有擴充功能但沒有 File System Access。）否決理由是平台，不是技術
- **用「簡單請求」繞過 preflight**：改成 `POST` + `Content-Type: text/plain`、token 放 body、不帶自訂標頭，這樣不會觸發 preflight，寫入真的會成功，而 slug 是 Kaburi 自己選的所以不需要讀回應。但 `no-cors` 的回應是 opaque，**500 和 200 分不出來**——對一個永久覆寫的操作，盲目發佈不可接受。而且 imitator 會失去「瀏覽器碰不到我的寫入 API」這個性質
- **`window.open` + `postMessage` 傳 File**：structured clone 帶得動 File，但手機上會被彈窗阻擋，且對方一旦設了 COOP 就斷掉，太脆弱
- **一次性上傳網址（presigned）**：誰來簽？簽的那次呼叫本身就要認證，雞生蛋

### 更根本的重新框架

第 1 與第 2 條指向同一個結論：**這件事整個不屬於 Kaburi。**

phase 3 也許不該是「Kaburi 長出發佈功能」，而該是「**imitator 長出手機發佈介面**」。Kaburi 保持乾淨（沒有 token、沒有後端、`connect-src 'self'` 原封不動），imitator 拿到一個它本來就想要的能力：不用 CLI 也能從手機推東西上去。

這也是最符合交接文件那條分工的答案：Kaburi 處理完就下檯，發佈從頭到尾是 imitator 的事。**所以這一節的結論是「Kaburi 不做」，而不是「Kaburi 等別人改完再做」。**

### 發佈端要處理的問題（跟走哪一條路無關）

這些是 imitator 的 API 契約帶來的，發佈的程式碼寫在誰身上就是誰要處理：

| 問題 | 細節 |
|---|---|
| slug 規則 | `/^[a-z0-9-]{1,64}$/`。檯面上的 `中文筆記.html` 沒有音譯就產不出合法 slug |
| 覆寫是永久的 | R2 沒有 versioning，imitator spec §4.2 明寫「覆寫同一個 slug，舊的 HTML 就沒了」 |
| 撞 slug | spec 自己說最可能的災難「不是惡意內鬼，是兩個自動發佈者撞到同一個 slug」。任何新的自動發佈者都是那第二個，送出前必須先查、撞名要明確確認 |
| token 範圍 | `imi_{gid}_{epoch}_{rand}` 只能寫自己組，但能 LIST 與 DELETE 該組全部。外洩的補救是輪替 `writeSecret`，那會殺掉該組所有 CLI token |
| `X-Sandbox` | 必須寫死 `on`，UI 連選項都不要有 |
| 讀回來要 cookie | `group` 可見度的讀取要 imitator 網域上的 `__Host-imi` cookie，沒走過 magic link 的裝置會看到 404，容易被誤判成發佈失敗 |

### Kaburi 要付的代價（只有第 3、4 條要付）

- `connect-src` 要從 `'self'` 放寬，**會失去「就算真的有 XSS，資料也出不去」這個性質**
- 儲存裡有了 token 之後，預覽 iframe 那條「`allow-scripts` 與 `allow-same-origin` 不能同時給」從規範升級成命脈——後面站著的是整組的報告庫

**第 1、2 條 Kaburi 一毛都不用付**：不存 token、不改 CSP、不長後端。這是它們最大的優勢，也是為什麼結論會是換邊做。

### 還有一個架構問題

交接文件開宗明義：「BentoDrop 運送、Kaburi 處理、SnapDeck 呈現。任何新功能先問它屬於哪一段，不屬於『處理』的一律不做。」**發佈報告屬於「呈現」**，照這條規矩應該擋掉。搜尋、標籤、多資料夾都是靠這條界線擋下來的。

值得注意的是，上面第 1 條（imitator 自己讀檔）與第 2 條（share target）是唯一不牴觸這條界線的作法——前者 Kaburi 根本沒參與，後者 Kaburi 只是把檔案交出去。第 3、4 條都是在 Kaburi 裡蓋一個發佈器。

## 字級

所有 `font-size` 都是 `rem`，根字級是 `app.css` 最上面的 `--type`：桌機 `1`（16px 基準），`max-width:600px` 的手機 `1.15`。要調整就改這兩個數字，其他不用動。閱讀區在桌機是 18px / 1.8。

## 無障礙

- **下檯有鍵盤路徑**：檔案列聚焦後按 `←` `→` 就是下檯／回檯，和左右滑同一件事。刻意不在檯面上加按鈕，提示放在 `title`（滑鼠）與 `aria-keyshortcuts`（螢幕閱讀器）。下檯後列表會重建，焦點會被放回同一個位置的列上，可以連按處理好幾筆。
- **toast 是常駐的 live region**：`index.html` 裡那個空的 `#toast` 帶 `role="status" aria-live="polite" aria-atomic="true"`，`flash()` 只換 `textContent`，沒訊息時留空由 CSS `:empty` 隱藏。**不要改成每次新建元素再插進 DOM**，那樣螢幕閱讀器不保證會念。

## 現況與待辦

**已做**：草模全部功能、真實資料夾（把手存 IndexedDB、重新授權、`move()` 改名 + copy+delete 退路、覆蓋防護、mtime 下檯清單）、便條純記憶體、app / tablet 佈局、桌機 PWA 的 window-controls-overlay、file_handlers + launchQueue、離線、Workers 部署與 dev domain 關閉、Phase 2 share target、鍵盤與螢幕閱讀器路徑。兩輪資安審查跑完，沒有未處理的發現。

**已實機確認**

| 項目 | 結果 |
|---|---|
| Win11 / ChromeOS 安裝成 PWA、開檔、改、存 | 通過 |
| **資料夾授權：桌機安裝的 PWA** | **零點擊。**Chrome 122 的持久權限把授權記在設定檔裡，重開時直接回 `granted`。經過後續幾輪改動仍然成立，share target 也是零點擊 |
| **資料夾授權：Android** | **每次文件重新建立就要點一下**，分頁與安裝的 PWA 沒有差別。授權跟著文件走，Android 沒有持久權限這一層，網頁端沒有 API 能繞過去。<br>會觸發：手動 refresh、從最近使用清單滑掉再開、系統回收背景後再開。<br>不會觸發：切到別的 app 再切回來（文件還活著）、app 內部的開檔／存檔／改名／下檯。<br>所以一段連續的工作只在開頭付一次成本。整個畫面任一處點下去都算授權，不用瞄準按鈕 |
| share target（phase 2 §10 的 1–5） | 通過：分享 `.md` 落進資料夾、中文檔名正確、同名變 `-2`、文字變便條、分享照片不出現 Kaburi |

**踩過的坑**（交接文件 §7 沒有的，都有測試守著）

1. **大小寫不敏感的檔案系統會吃掉檔案。** Windows 與 Android 上 `getFileHandle("A.md", {create:true})` 拿到的就是 `a.md` 那一個檔；copy+delete 改名若照常往下走，`removeEntry("a.md")` 會刪掉唯一一份。寫入前一定要 `isSameEntry` 比對，相同就中止。
2. **SW 把每次導覽都存成離線殼。** 直接在網址列開 `/icon-192.png` 這種子路徑也是一次導覽，那個 PNG 會被存成 `/`，之後離線開 app 拿到的就是圖片。只有 `text/html` 能寫進殼那個 key。
3. **`String.replace(字串, 值)` 會解讀替換樣式。** 檔名帶 `$&` 或 `` $` `` 時，`t("renamed", name)` 產出的提示會錯亂（``a$`b.md`` 變成 `aRenamed → b.md`）。用函式形式的 replace 才會照字面帶入。
4. **CSP 的 `form-action 'none'` 也擋自家的表單。** 要測跨站 POST `/share`，只能另外起一個來源的伺服器發動，從 Kaburi 自己的頁面送表單會被自己的 CSP 擋掉。

**知道但先不做**

- `scan()` 會逐一 `getFile()` 讀整個資料夾的 mtime 與大小，而它在每次 `focus` / 回到前景時都會跑一次。資料夾大就會頓。工作檯的定位是小資料夾，現在的做法簡單且不會有快取失效的錯，先不優化。真的頓了，最小的改法是拉長 `rescanSoon` 的 debounce 或加一道節流，不用改資料結構。

**待實機驗證**（交接文件 §9 尚未勾的）

- Pixel：改名走 copy+delete，確認磁碟上真的變了
- Android 的重新授權提示裡有沒有「每次造訪都允許」這個選項。有的話上面那一列就能改寫；目前的結論是沒有
- 已安裝的 PWA 按全螢幕鍵，`display-mode: fullscreen` 是否切到 tablet mode
- ChromeOS 檔案 app「開啟方式」點 `.md` 能否直接進來（file_handlers）
- Windows 1280 / 1536 / 1920 確認沒有水平捲軸（本機只用 Linux Chromium 跑過同一個判斷式）
- share target 在 ChromeOS 與 Windows 各跑一次（Android 已驗）；分享後直接關掉 app 再開，確認沒殘留、沒重複落檔

**backlog**（照交接文件，下個 phase 才碰）

| 項目 | 狀態 | 原因 |
|---|---|---|
| 手動切換 app / tablet 的 chip | 等全螢幕鍵實機驗完 | 切不動才補，存 `kaburi.layout` |
| 推上 imitator | **不做**（結論是換邊） | 卡在 imitator 沒有 CORS 且那是刻意的；而最好的解法（imitator 的 PWA 自己讀檔）Kaburi 一行都不用改。完整理由見上面「Phase 3 候選」一節 |

**不做**：開資料夾外的檔案、多資料夾、刪檔、搜尋／標籤／版本／同步、便條加 AI、抽共用 render 元件。

## 本機

```sh
npm run serve      # http://localhost:3000，Chrome 132+ 才有 File System Access
npm run check      # 需要全域 playwright；截圖在 scripts/shots/
npm run icons      # 重畫 icon
```

`check` 目前 65 條，用 OPFS 當假資料夾驅動整個流程：

- **檔案**：開檔、存回磁碟、`move()` 改名、copy+delete 改名、覆蓋防護、大小寫同檔擋下、新板子、滑動下檯、鍵盤下檯與焦點、外部修改自癒
- **算繪**：markdown 表格、`javascript:` 連結被中和、HTML 預覽在 sandbox 裡跑且 script 不執行
- **share target**：檔案／文字分流、`-2` 尾碼、檔名消毒、清 cache、重整不重複、無資料夾等待、token 不符就丟掉、真的從第二個來源發動一次跨站表單 POST
- **殼**：CSP 標頭、SW precache、子路徑導覽不會蓋掉殼、斷網能開、便條不落地、console 無錯誤
- **版面**：app / tablet 兩種佈局 × 412 / 900 / 1440 / 1920 四種寬度確認沒有水平捲軸，並截圖到 `scripts/shots/`

真實資料夾的選取、系統分享選單、持久權限都需要使用者手勢或作業系統參與，只能實機驗。
