# Kaburi

處理生魚片的工作檯。開一個固定資料夾裡的 md / html / txt，看、改、改名、存回原檔，再滑掉。

- 正式站：`https://kaburi.ai-apps.work`
- 純靜態 PWA，沒有 build step。站台檔案全在 [`public/`](public/)，跑在 Cloudflare Workers static assets 上。
- 規格與設計理由見交接文件；版面、互動、文案以草模為準。

## 檔案

```
public/
  index.html          殼
  boot.js             同步跑在 <head>：主題 / 語言 / 佈局，以及 *.pages.dev → 正式網域
  app.js              全部邏輯：資料夾把手、列表、stage、改名、便條
  app.css             三層深度、app / tablet 兩種佈局
  manifest.json       file_handlers 在這裡；display_override 開 window-controls-overlay，桌機 PWA 的 OS 標題列讓給 app
  sw.js               只為離線：precache 殼，其餘 cache-first
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

## 本機

```sh
npm run serve      # http://localhost:3000，Chrome 132+ 才有 File System Access
npm run check      # 需要全域 playwright；截圖在 scripts/shots/
npm run icons      # 重畫 icon
```

`check` 用 OPFS 當假資料夾驅動整個流程（開檔、存回、move() 改名、copy+delete 改名、覆蓋防護、新板子、滑動下檯、外部修改自癒、便條不落地、離線）。真實資料夾的選取需要使用者手勢，只能實機驗。
