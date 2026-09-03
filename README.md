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
  app.js              全部邏輯：資料夾把手、列表、stage、改名、便條
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
- **HTML 預覽** 走 `srcdoc` + `sandbox=""`。CSP 會被 iframe 繼承，所以預覽裡的 script、外部圖片、外部 CSS 全部不會跑。`allow-scripts` 與 `allow-same-origin` 永遠不能同時給。
- 沒有後端、沒有 analytics、沒有第三方資源。偏好（主題、語言、下檯清單）在 `localStorage`，資料夾把手在 IndexedDB，便條只在記憶體。

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
| Android 安裝成 PWA 後重開 | 每次都要點一下重新授權。Android 的 File System Access 沒有持久權限，這是平台限制不是 bug；整個畫面任一處點下去都算授權 |
| 桌機安裝成 PWA、Chrome 122 持久權限 | 通過。重開時不帶手勢的 `requestPermission()` 靜默回 granted，不用再點；share target 零點擊 |
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
- 已安裝的 PWA 按全螢幕鍵，`display-mode: fullscreen` 是否切到 tablet mode
- ChromeOS 檔案 app「開啟方式」點 `.md` 能否直接進來（file_handlers）
- Windows 1280 / 1536 / 1920 確認沒有水平捲軸（本機只用 Linux Chromium 跑過同一個判斷式）
- share target 在 ChromeOS 與 Windows 各跑一次（Android 已驗）；分享後直接關掉 app 再開，確認沒殘留、沒重複落檔

**backlog**（照交接文件，下個 phase 才碰）

| 項目 | 狀態 | 原因 |
|---|---|---|
| 手動切換 app / tablet 的 chip | 等全螢幕鍵實機驗完 | 切不動才補，存 `kaburi.layout` |

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
