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
  manifest.json       file_handlers 在這裡；display_override 開 window-controls-overlay，桌機 PWA 的 OS 標題列讓給 app
  sw.js               只為離線：一律先抓網路、斷網才用快取，部署後下一次開啟就是新版
  icon-*.png          由 scripts/icons.cjs 產生
  _headers            回應標頭（CSP、HSTS、noindex…），Workers static assets 會讀
  robots.txt          Disallow all
wrangler.jsonc        Workers 設定：assets 目錄、關 workers.dev、custom domain
scripts/
  icons.cjs           用 Chromium 畫 icon
  check.cjs           起本機伺服器（帶 _headers）、用 OPFS 假資料夾跑完整流程、截 412 / 900 / 1440 / 1920 四種寬度
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

## 字級

所有 `font-size` 都是 `rem`，根字級是 `app.css` 最上面的 `--type`：桌機 `1`（16px 基準），`max-width:600px` 的手機 `1.15`。要調整就改這兩個數字，其他不用動。閱讀區在桌機是 18px / 1.8。

## 現況與待辦

**已做**：草模全部功能、真實資料夾（把手存 IndexedDB、重新授權、`move()` 改名 + copy+delete 退路、覆蓋防護、mtime 下檯清單）、便條純記憶體、app / tablet 佈局、桌機 PWA 的 window-controls-overlay、file_handlers + launchQueue、離線、Workers 部署與 dev domain 關閉。

**已實機確認**

| 項目 | 結果 |
|---|---|
| Win11 / ChromeOS 安裝成 PWA、開檔、改、存 | 通過 |
| Android 安裝成 PWA 後重開 | 每次都要點一下重新授權。Android 的 File System Access 沒有持久權限，這是平台限制不是 bug；整個畫面任一處點下去都算授權 |

**待實機驗證**（交接文件 §9 尚未勾的）

- Pixel：改名走 copy+delete，確認磁碟上真的變了
- 桌機安裝成 PWA 後，Chrome 122 持久權限是否真的免掉重新授權
- 已安裝的 PWA 按全螢幕鍵，`display-mode: fullscreen` 是否切到 tablet mode
- ChromeOS 檔案 app「開啟方式」點 `.md` 能否直接進來（file_handlers）
- Windows 1280 / 1536 / 1920 確認沒有水平捲軸（本機只用 Linux Chromium 跑過同一個判斷式）

**backlog**（照交接文件，下個 phase 才碰）

| 項目 | 狀態 | 原因 |
|---|---|---|
| `share_target`（Android 接收分享） | backlog | 分享進來的是 `File` 不是 handle，存不回原檔；設計上應寫進當前資料夾變成正常檔案 |
| 手動切換 app / tablet 的 chip | 視需要 | 只有全螢幕鍵切不動時才補，存 `kaburi.layout` |
| 標題列的檔名改成 rem 換行而非截斷 | 小 | 手機 412 寬長檔名會「…」，改名時仍是全名 |

**不做**：開資料夾外的檔案、多資料夾、刪檔、搜尋／標籤／版本／同步、便條加 AI、抽共用 render 元件。

## 本機

```sh
npm run serve      # http://localhost:3000，Chrome 132+ 才有 File System Access
npm run check      # 需要全域 playwright；截圖在 scripts/shots/
npm run icons      # 重畫 icon
```

`check` 用 OPFS 當假資料夾驅動整個流程（開檔、存回、move() 改名、copy+delete 改名、覆蓋防護、新板子、滑動下檯、外部修改自癒、便條不落地、離線）。真實資料夾的選取需要使用者手勢，只能實機驗。
