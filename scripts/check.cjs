/* Serves public/ with the same headers Cloudflare will send, then drives the app in Chromium.
   Run: NODE_PATH=$(npm root -g) node scripts/check.cjs            (screenshots land in scripts/shots/) */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "public");
const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

/* parse _headers (only the "/*" block matters for the app shell) */
function parseHeaders() {
  const out = {};
  let cur = null;
  for (const line of fs.readFileSync(path.join(ROOT, "_headers"), "utf8").split("\n")) {
    if (!line.trim()) { cur = null; continue; }
    if (!/^\s/.test(line)) { cur = line.trim(); out[cur] = out[cur] || {}; continue; }
    const i = line.indexOf(":"); out[cur][line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const HDR = parseHeaders();
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/manifest+json", ".png": "image/png", ".txt": "text/plain" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("nope"); }
  const h = Object.assign({}, HDR["/*"], HDR[p] || {}, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  res.writeHead(200, h); fs.createReadStream(file).pipe(res);
});

const fails = [];
async function back(page) { await page.click("#back"); await page.waitForFunction(() => !document.getElementById("stage").classList.contains("open")); await page.waitForTimeout(320); }
function check(ok, msg) { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) fails.push(msg); }

/* seed an OPFS folder inside the page and hand it to the app */
async function seed(page) {
  await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    for await (const [name] of dir.entries()) await dir.removeEntry(name, { recursive: true });
    const H = 3600000, now = Date.now();
    /* oldest first, with a gap so mtimes sort the way the test expects */
    const files = [
      ["snapdeck-adr.md", "# ADR"],
      ["bentodrop-notes.txt", "R2 那段"],
      ["modbus-cfx-draft.md", "# Modbus → CFX"],
      ["eap-vm-list.md", "# EAP VM\n\n盤點中。"],
      ["kaburi-handoff.md", "# Kaburi\n\n工作檯，不是倉庫。\n\n## Scope\n\n- 固定一個工作資料夾\n- `view` / `edit` 一個開關\n\n> share_target 進 backlog。\n\n| platform | write back | rename |\n|---|---|---|\n| Win11 | pass | move() |\n| Android | pass | copy+delete |\n\n[link](https://example.com) [bad](javascript:alert(1))"],
      ["notes-0903.md", "## 早上想到的\n\n三次法則的反面用法：**第二次不要提前動手**。"],
      ["o11y-report.html", "<h1>Incident review</h1><p id=\"p\">preview via srcdoc</p><script>document.body.innerHTML='PWNED'</script>"],
      ["scratch.txt", "vector -> ck alias\nTODO: 週五前回覆"],
    ];
    for (const [n, body] of files) {
      const h = await dir.getFileHandle(n, { create: true });
      const w = await h.createWritable(); await w.write(body); await w.close();
      await new Promise((r) => setTimeout(r, 25));
    }
    await window.__kaburi.useDir(dir);
  });
  await page.waitForFunction(() => window.__kaburi.state() === "ready" && window.__kaburi.files().length === 8);
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  /* 1. headers reach the browser, no console errors, CSP allows the app + srcdoc preview */
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    await ctx.addInitScript(() => { window.__noSW = true; });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" && !/sandboxed and the 'allow-scripts'/.test(m.text())) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    const resp = await page.goto(base + "/");
    check(/frame-ancestors 'none'/.test(resp.headers()["content-security-policy"] || ""), "CSP header served");
    await page.evaluate(() => localStorage.clear());
    await page.waitForFunction(() => window.__kaburi && window.__kaburi.state() === "none");
    check(await page.isVisible("#pick"), "empty state shows Choose a folder");
    await page.screenshot({ path: path.join(SHOTS, "app-412-empty.png") });
    await seed(page);
    check((await page.$$(".slice")).length === 5, "recent mode shows 5 rows");
    check(await page.isVisible("button.more"), "Everything in this folder row present");
    check(await page.isVisible("#scope"), "scope toggle visible in status bar");

    /* open html: sandboxed srcdoc must render under the CSP, script must not run */
    await page.click(".slice:has-text('o11y-report.html')");
    await page.waitForSelector("#stage.open iframe.preview");
    const frame = page.frames().find((f) => f.parentFrame() && f.url() === "about:srcdoc");
    await page.waitForTimeout(300);
    const txt = frame ? await frame.evaluate(() => document.body.innerText).catch(() => "") : "";
    check(/preview via srcdoc/.test(txt) && !/PWNED/.test(txt), "html preview rendered in sandbox, script blocked (got: " + JSON.stringify(txt) + ")");
    await back(page);

    /* md render + link sanitising */
    await page.click(".slice:has-text('kaburi-handoff.md')");
    await page.waitForSelector("#stage.open .read table");
    const hrefs = await page.$$eval(".read a", (as) => as.map((a) => a.getAttribute("href")));
    check(hrefs[0] === "https://example.com" && hrefs[1] === "#", "javascript: link neutralised " + JSON.stringify(hrefs));

    /* edit + save writes to disk */
    await page.click("#vtog");
    await page.fill("#src", "# changed\n\nsaved from test");
    check(await page.isVisible("#save"), "Save appears once dirty");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "app-412-edit.png") });
    await page.click("#save");
    await page.waitForSelector("#save", { state: "hidden" });
    const disk = await page.evaluate(async () => { const d = await navigator.storage.getDirectory(); return (await (await d.getFileHandle("kaburi-handoff.md")).getFile()).text(); });
    check(disk === "# changed\n\nsaved from test", "save wrote back to the file");

    /* rename via move(), then via copy+delete, then duplicate is blocked */
    await page.click("#fname"); await page.fill("input#fname", "renamed.md"); await page.press("input#fname", "Enter");
    await page.waitForFunction(() => window.__kaburi.cur().name === "renamed.md");
    let names = await page.evaluate(async () => { const d = await navigator.storage.getDirectory(); const n = []; for await (const [k] of d.entries()) n.push(k); return n; });
    check(names.includes("renamed.md") && !names.includes("kaburi-handoff.md"), "rename via move() changed disk");
    await page.evaluate(() => { Object.defineProperty(window.__kaburi.cur().handle, "move", { value: undefined }); });
    await page.click("#fname"); await page.fill("input#fname", "renamed-2.txt"); await page.press("input#fname", "Enter");
    await page.waitForFunction(() => window.__kaburi.cur().name === "renamed-2.txt");
    names = await page.evaluate(async () => { const d = await navigator.storage.getDirectory(); const n = []; for await (const [k] of d.entries()) n.push(k); return n; });
    check(names.includes("renamed-2.txt") && !names.includes("renamed.md"), "rename via copy+delete changed disk");
    check(await page.$eval("#src", (e) => e.value) === "# changed\n\nsaved from test", "content survived copy+delete");
    page.once("dialog", (d) => d.dismiss());
    await page.click("#fname"); await page.fill("input#fname", "scratch.txt"); await page.press("input#fname", "Enter");
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.__kaburi.cur().name) === "renamed-2.txt", "rename onto existing name asks and is cancelled");
    await back(page);

    /* new board */
    await page.click("#addFile");
    await page.waitForFunction(() => window.__kaburi.cur() && window.__kaburi.cur().name === "untitled.md");
    names = await page.evaluate(async () => { const d = await navigator.storage.getDirectory(); const n = []; for await (const [k] of d.entries()) n.push(k); return n; });
    check(names.includes("untitled.md"), "+ created untitled.md on disk");
    await page.waitForTimeout(150);
    check(await page.evaluate(() => document.activeElement && document.activeElement.id === "src"), "cursor in the new board");
    await back(page);

    /* stow with a swipe, then everything view shows it, then heal after external edit */
    const row = await page.$(".slice:has-text('scratch.txt')");
    const box = await row.boundingBox();
    await page.mouse.move(box.x + 200, box.y + box.height / 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 200 - i * 20, box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(250);
    check(!(await page.isVisible(".slice:has-text('scratch.txt')")), "swipe stows the row");
    check(JSON.parse(await page.evaluate(() => localStorage.getItem("kaburi.stowed")))["scratch.txt"] > 0, "stowed persisted as {name: mtime}");
    await page.click("#scope");
    check(await page.$eval(".slice:has-text('scratch.txt')", (e) => e.classList.contains("stowed")), "all view lists the stowed row dimmed");
    await page.click("#scope");
    await page.evaluate(async () => { const d = await navigator.storage.getDirectory(); const h = await d.getFileHandle("scratch.txt"); const w = await h.createWritable(); await w.write("edited outside"); await w.close(); await window.__kaburi.scan(); });
    await page.waitForTimeout(100);
    check(await page.isVisible(".slice:has-text('scratch.txt')"), "externally edited file heals back onto the counter");

    /* notes: memory only */
    await page.click("#tab-notes"); await page.click("#add");
    await page.fill(".note textarea", "sk-ant-xxx");
    check(!(await page.$eval("#dot", (e) => e.hidden)), "notes dot lit");
    await page.reload(); await page.waitForFunction(() => window.__kaburi);
    check((await page.$$(".note")).length === 0, "note gone after reload");

    check(errors.length === 0, "no console errors: " + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. layouts × widths × themes × languages, plus the horizontal-scroll trap */
  for (const layout of ["app", "tablet"]) {
    for (const width of [412, 900, 1440, 1920]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 860 } });
      await ctx.addInitScript(() => { window.__noSW = true; });
      const page = await ctx.newPage();
      await page.goto(base + "/");
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.__kaburi);
      await seed(page);
      await page.evaluate((l) => document.documentElement.setAttribute("data-layout", l), layout);
      if (layout === "tablet") { await page.click(".slice:has-text('kaburi-handoff.md')"); await page.waitForSelector(".read"); }
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      check(sw[0] === sw[1], `${layout}@${width}: no horizontal scroll (${sw[0]} vs ${sw[1]})`);
      await page.screenshot({ path: path.join(SHOTS, `${layout}-${width}-dark-en.png`) });
      if (width === 412 || width === 1440) {
        await page.click("#themeBtn"); await page.click("#langBtn"); await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(SHOTS, `${layout}-${width}-light-zh.png`) });
        if (layout === "app") { await page.click("#tab-notes"); await page.click("#add"); await page.click("#add"); await page.fill(".note textarea", "EAP demo\nadmin / 週五前改掉"); await page.waitForTimeout(100); await page.screenshot({ path: path.join(SHOTS, `${layout}-${width}-notes-light-zh.png`) }); }
      }
      await ctx.close();
    }
  }

  /* 3. service worker installs and serves the shell offline */
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base + "/");
    const keys = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      for (let i = 0; i < 100; i++) {
        const c = await caches.open("kaburi-v1"); const k = await c.keys();
        if (k.length >= 8 && navigator.serviceWorker.controller) return k.map((r) => new URL(r.url).pathname);
        await new Promise((r) => setTimeout(r, 100));
      }
      return [];
    });
    await page.reload();
    check(keys.includes("/") && keys.includes("/app.js"), "sw precached the shell " + JSON.stringify(keys));
    await ctx.setOffline(true);
    const r = await page.reload().catch(() => null);
    check(!!r && (await page.isVisible(".wordmark")), "shell loads offline");
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails.length ? `\n${fails.length} failure(s)` : "\nall green");
  process.exit(fails.length ? 1 : 0);
})();
