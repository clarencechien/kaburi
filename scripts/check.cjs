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
    check(await page.$eval("#toast", (e) => e.getAttribute("role") === "status" && e.getAttribute("aria-live") === "polite" && e.textContent === ""),
      "toast is a permanent, empty live region at boot");
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
    const onDiskNames = async () => page.evaluate(async () => {
      const d = await navigator.storage.getDirectory(); const n = [];
      for await (const [k] of d.entries()) n.push(k); return n;
    });
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

    await back(page);

    /* ── file types ───────────────────────────────────────────────────────── */
    const writeBytes = (name, bytes) => page.evaluate(async ({ name, bytes }) => {
      const d = await navigator.storage.getDirectory();
      const h = await d.getFileHandle(name, { create: true });
      const w = await h.createWritable(); await w.write(new Uint8Array(bytes)); await w.close();
    }, { name, bytes });
    const writeText = (name, text) => page.evaluate(async ({ name, text }) => {
      const d = await navigator.storage.getDirectory();
      const h = await d.getFileHandle(name, { create: true });
      const w = await h.createWritable(); await w.write(text); await w.close();
    }, { name, text });
    const bytesOf = (name) => page.evaluate(async (name) => {
      const d = await navigator.storage.getDirectory();
      const f = await (await d.getFileHandle(name)).getFile();
      return Array.from(new Uint8Array(await f.arrayBuffer()));
    }, name);

    await writeText("cfg.json", '{"b":2,"a":[1,2]}');
    await writeText("rows.csv", 'name,note\n"a,1","says ""hi"""\nb,2');
    await writeText("conf.yaml", "root:\n  key: value\n  list:\n    - one");
    await writeText("run.log", "  indented\n# not a heading\n*not em*");
    await page.evaluate(() => window.__kaburi.scan());
    await page.waitForFunction(() => window.__kaburi.files().length === 12);
    const bands = await page.$$eval(".slice", (els) => els.map((e) => [
      e.querySelector("b").textContent, e.querySelector(".cut").className]));
    const bandOf = (n) => (bands.find((b) => b[0] === n) || [null, "missing"])[1];
    check(bandOf("cfg.json") === "cut data" && bandOf("rows.csv") === "cut data" && bandOf("conf.yaml") === "cut data",
      "data types share the tamago band " + JSON.stringify(bands.map((b) => b[1])));
    check(bandOf("run.log") === "cut plain", "log takes the plain band");

    await page.click(".slice:has-text('cfg.json')");
    await page.waitForSelector("#stage.open .jsontree");
    check(await page.$$eval(".jsontree .jkey", (e) => e.map((x) => x.textContent)).then((k) => k.includes("b") && k.includes("a")),
      "json renders as a tree with its keys");
    check(await page.$$eval(".jsontree .jval", (e) => e.map((x) => x.textContent)).then((v) => v.includes("2") && v.includes("1")),
      "values carry the emphasis colour class");
    check(await page.$eval(".jsontree .jval", (e) => getComputedStyle(e).color) !== await page.$eval(".jsontree .jkey", (e) => getComputedStyle(e).color),
      "values and keys are visually distinct");
    check(await page.$$eval(".jsontree details", (d) => d.length) === 2, "objects and arrays are collapsible");
    await page.click(".jsontree summary");
    check(await page.$eval(".jsontree details", (d) => !d.open), "a summary click folds it");
    await back(page);

    await page.click(".slice:has-text('rows.csv')");
    await page.waitForSelector("#stage.open .read table");
    const cells = await page.$$eval(".read td", (t) => t.map((e) => e.textContent));
    const heads = await page.$$eval(".read th", (t) => t.map((e) => e.textContent));
    check(heads.join("|") === "name|note", "csv first row becomes the header");
    check(cells[0] === "a,1" && cells[1] === 'says "hi"', "quoted commas and doubled quotes survive " + JSON.stringify(cells));
    await page.click(".csvbar input");
    await page.waitForFunction(() => document.querySelectorAll(".read th").length === 0);
    check((await page.$$eval(".read td", (t) => t.length)) === 6, "unchecking the header box redraws with every row as data");
    check(await page.$$eval(".read td.num", (t) => t.length) === 0,
      "one stray number in a text column does not make the column numeric");
    await page.click(".csvbar input");
    await back(page);

    /* numeric columns are inferred per column, and a leading zero means a code */
    await writeText("users.csv", "UserID,Name,JoinDate,Phone,Score,IsActive\n" +
      "101,Jane,2026-01-15,0912345678,3.5,True\n102,John,2026-02-20,0987654321,0.5,False");
    await page.evaluate(() => window.__kaburi.scan());
    await page.click(".slice:has-text('users.csv')");
    await page.waitForSelector("#stage.open .read table");
    const numCells = await page.$$eval(".read td.num", (t) => t.map((e) => e.textContent));
    check(numCells.join("|") === "101|3.5|102|0.5", "only wholly numeric columns are marked " + JSON.stringify(numCells));
    check(!numCells.some((c) => /^09/.test(c)), "a leading zero keeps a phone number as text");
    check(!numCells.some((c) => /2026-/.test(c)), "dates are not numbers");
    await back(page);

    await page.click(".slice:has-text('run.log')");
    await page.waitForSelector("#stage.open #src");
    check(await page.$eval("#vtog", (e) => e.dataset.mode) === "edit", "log opens straight into edit");
    await page.click("#vtog");
    await page.waitForSelector(".plainread");
    const plain = await page.$eval(".plainread", (e) => e.textContent);
    check(plain.startsWith("  indented") && plain.includes("# not a heading"), "plain view keeps indentation and does not parse markdown");
    check(await page.$$eval(".plainread span", (e) => e.length) === 0, "a log is not tinted, only yaml is");
    check(await page.$$eval(".plainread h1", (h) => h.length) === 0, "plain view produces no headings");
    await back(page);

    /* yaml: line tinting only, never a structural claim */
    await page.click(".slice:has-text('conf.yaml')");
    await page.waitForSelector("#stage.open .plainread .ykey");
    check(await page.$eval("#vtog", (e) => e.dataset.mode) === "view", "yaml opens in view: tinting makes it differ from the source");
    check(await page.$$eval(".plainread .ykey", (e) => e.map((x) => x.textContent)).then((k) => k.includes("root") && k.includes("key")),
      "yaml keys are tinted");
    check(await page.$$eval(".plainread .yval", (e) => e.map((x) => x.textContent)).then((v) => v.includes("value")),
      "yaml values take the emphasis colour");
    check((await page.$eval(".plainread", (e) => e.textContent)) === "root:\n  key: value\n  list:\n    - one",
      "tinting does not alter a single character of the text");
    await back(page);

    /* too many nodes to lay out falls back to text */
    await writeText("wide.json", JSON.stringify(Array.from({ length: 5000 }, (_, i) => i)));
    await page.evaluate(() => window.__kaburi.scan());
    await page.click(".slice:has-text('wide.json')");
    await page.waitForSelector("#stage.open .strip");
    check(await page.$$eval(".jsontree", (e) => e.length) === 0 && (await page.$eval(".plainread", (e) => e.textContent)).startsWith("[\n  0"),
      "a json with too many nodes falls back to pretty text");
    await back(page);

    /* rename across types */
    await page.click(".slice:has-text('conf.yaml')");
    await page.waitForSelector("#stage.open");
    await page.click("#fname"); await page.fill("input#fname", "conf.json"); await page.press("input#fname", "Enter");
    await page.waitForFunction(() => window.__kaburi.cur().name === "conf.json");
    check((await onDiskNames()).includes("conf.json"), "rename md-family into .json is allowed and lands on disk");
    await page.click("#fname"); await page.fill("input#fname", "conf.yaml"); await page.press("input#fname", "Enter");
    await page.waitForFunction(() => window.__kaburi.cur().name === "conf.yaml");
    await back(page);

    /* broken json falls back instead of blocking */
    await writeText("broken.json", "{oops");
    await page.evaluate(() => window.__kaburi.scan());
    await page.click(".slice:has-text('broken.json')");
    await page.waitForSelector("#stage.open .strip");
    check(/JSON/i.test(await page.$eval(".strip", (e) => e.textContent)) && (await page.$eval(".plainread", (e) => e.textContent)) === "{oops",
      "unparseable json shows the raw text with a strip, not an error");
    check(await page.$eval("#vtog", (e) => !e.disabled), "a broken json is still editable");
    await back(page);

    /* not UTF-8: view only, toggle disabled, save refuses */
    await writeBytes("big5.log", [0xB4, 0xFA, 0xB8, 0xD5, 0x0A]);
    await page.evaluate(() => window.__kaburi.scan());
    await page.click(".slice:has-text('big5.log')");
    await page.waitForSelector("#stage.open .strip");
    check(await page.$eval("#vtog", (e) => e.disabled), "a non-UTF-8 file disables the view/edit toggle");
    check(await page.evaluate(async () => {
      const f = window.__kaburi.cur(); f.body = "clobbered";
      await window.__kaburi.save();
      const d = await navigator.storage.getDirectory();
      const b = new Uint8Array(await (await (await d.getFileHandle("big5.log")).getFile()).arrayBuffer());
      return b[0] === 0xB4;
    }), "save refuses to write over a file it could not decode");
    await back(page);

    /* bytes the user did not touch survive a round trip */
    const bomCsv = [0xEF, 0xBB, 0xBF, 0x61, 0x2C, 0x62, 0x0D, 0x0A, 0x31, 0x2C, 0x32, 0x0D, 0x0A];
    await writeBytes("excel.csv", bomCsv);
    await page.evaluate(() => window.__kaburi.scan());
    await page.click(".slice:has-text('excel.csv')");
    await page.waitForSelector("#stage.open .read table");
    await page.evaluate(async () => { window.__kaburi.markDirty(); await window.__kaburi.save(); });
    await page.waitForTimeout(200);
    check(JSON.stringify(await bytesOf("excel.csv")) === JSON.stringify(bomCsv),
      "a BOM + CRLF file saved untouched is byte-identical");
    await back(page);

    /* over 1 MB: stays on the counter, refuses to open */
    await writeText("huge.log", "x".repeat(1048577));
    await page.evaluate(() => window.__kaburi.scan());
    await page.click(".slice:has-text('huge.log')");
    await page.waitForTimeout(300);
    check(!(await page.$eval("#stage", (e) => e.classList.contains("open"))), "a file over 1 MB does not open");
    check(/1 MB/.test(await page.$eval("#toast", (e) => e.textContent)), "and says why");
    check(await page.isVisible(".slice:has-text('huge.log')"), "but stays on the counter");

    await page.evaluate(async () => {
      const d = await navigator.storage.getDirectory();
      for (const n of ["cfg.json", "rows.csv", "conf.yaml", "run.log", "broken.json", "big5.log", "excel.csv", "huge.log", "wide.json", "users.csv"]) {
        try { await d.removeEntry(n); } catch (e) {}
      }
      await window.__kaburi.scan();
    });
    await page.click(".slice:has-text('kaburi-handoff.md')");
    await page.waitForSelector("#stage.open .read table");

    /* edit + save writes to disk */
    await page.click("#vtog");
    await page.fill("#src", "# changed\n\nsaved from test");
    check(await page.isVisible("#save"), "Save appears once dirty");
    await page.waitForTimeout(400);
    await page.fill("#src", "# changed\n" + "line\n".repeat(80) + "saved from test");
    await page.evaluate(() => { const t = document.getElementById("src"); t.setSelectionRange(t.value.length, t.value.length); t.scrollTop = t.scrollHeight; });
    await page.click("#totop");
    check(await page.evaluate(() => { const t = document.getElementById("src"); return t.selectionStart === 0 && t.scrollTop === 0 && document.activeElement === t; }), "top button puts the caret on line 1");
    await page.fill("#src", "# changed\n\nsaved from test");
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

    /* a name holding $& / $` must reach the toast verbatim, not through replacement-pattern expansion */
    await page.click("#fname"); await page.fill("input#fname", "a$&b$`c.md"); await page.press("input#fname", "Enter");
    await page.waitForFunction(() => window.__kaburi.cur().name === "a$&b$`c.md");
    const dollarToast = await page.$eval(".toast", (e) => e.textContent);
    check(dollarToast.includes("a$&b$`c.md"), "a $-bearing name reaches the toast verbatim (" + dollarToast + ")");

    /* case-insensitive filesystems hand back the same file; the refusal must say so, not blame the extension */
    await page.evaluate(() => {
      Object.defineProperty(window.__kaburi.cur().handle, "move", { value: undefined, configurable: true });
      window.__sameOrig = FileSystemFileHandle.prototype.isSameEntry;
      FileSystemFileHandle.prototype.isSameEntry = async function () { return true; };
    });
    await page.click("#fname"); await page.fill("input#fname", "A$&B$`C.MD"); await page.press("input#fname", "Enter");
    await page.waitForTimeout(300);
    const sameToast = await page.$eval(".toast", (e) => e.textContent);
    check(await page.evaluate(() => window.__kaburi.cur().name) === "a$&b$`c.md", "case-only rename is refused, the file keeps its name");
    check(/same file/i.test(sameToast) && !/slashes/i.test(sameToast), "the refusal explains the collision, not the extension rule (" + sameToast + ")");
    await page.evaluate(async () => {
      FileSystemFileHandle.prototype.isSameEntry = window.__sameOrig;
      const d = await navigator.storage.getDirectory();
      try { await d.removeEntry("A$&B$`C.MD"); } catch (e) {}     /* stub-only artefact: a real case-insensitive FS creates nothing */
      await window.__kaburi.scan();
    });
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

    /* the swipe is not the only way off the counter */
    await page.focus(".slice:has-text('notes-0903.md')");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(250);
    check(!(await page.isVisible(".slice:has-text('notes-0903.md')")), "arrow key stows the focused row");
    check(await page.evaluate(() => !!document.activeElement && document.activeElement.classList.contains("slice")), "focus stays in the list after stowing");
    check((await page.$eval("#toast", (e) => e.textContent)).length > 0, "the live region carries the confirmation");
    await page.click("#scope");
    await page.focus(".slice:has-text('notes-0903.md')");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(250);
    check(!(await page.$eval(".slice:has-text('notes-0903.md')", (e) => e.classList.contains("stowed"))), "arrow key brings the row back");
    await page.click("#scope");

    /* share target intake: files land in the folder, text becomes a note */
    async function park(files, text) {
      const nonce = "tok-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      await page.evaluate(async ({ files, text, nonce }) => {
        const c = await caches.open("kaburi-share");
        await c.put("/__share/meta", new Response(JSON.stringify({ count: files.length, text, at: Date.now(), nonce })));
        for (let i = 0; i < files.length; i++) await c.put("/__share/file-" + i, new Response(files[i][1], { headers: { "x-kaburi-name": encodeURIComponent(files[i][0]) } }));
      }, { files, text, nonce });
      return nonce;
    }
    const onDisk = async () => page.evaluate(async () => { const d = await navigator.storage.getDirectory(); const n = []; for await (const [k] of d.entries()) n.push(k); return n; });
    /* a payload parked by someone else's POST is not drainable by a different launch */
    await park([["forged.md", "x"]], "");
    await page.goto(base + "/?share-target=not-the-token");
    await page.waitForFunction(() => window.__kaburi && window.__kaburi.state() === "ready" && location.search === "");
    await page.waitForTimeout(200);
    check(!(await onDisk()).includes("forged.md") && !(await page.evaluate(() => !!window.__kaburi.intake())), "wrong launch token: payload is not drained");
    check(await page.evaluate(async () => !(await caches.has("kaburi-share"))), "wrong launch token: payload is dropped, never left armed");
    await park([["forged.md", "x"]], "");
    await page.goto(base + "/");
    await page.waitForFunction(() => window.__kaburi && window.__kaburi.state() === "ready");
    await page.waitForTimeout(200);
    check(!(await onDisk()).includes("forged.md") && await page.evaluate(async () => !(await caches.has("kaburi-share"))), "plain launch drops a parked payload instead of draining it");

    let tok = await park([["scratch.txt", "shared body"], ["my notes 2.md", "# spaced"], ["../../evil<>.md", "x"], ["noext", "y"]], "");
    /* headless Chromium is a plain tab: files must wait for a tap even though permission is held */
    await page.goto(base + "/?share-target=" + tok);
    await page.waitForFunction(() => window.__kaburi && window.__kaburi.state() === "ready" && location.search === "" && window.__kaburi.intake());
    check(!(await page.$eval("#intake", (e) => e.hidden)), "browser tab: shared files wait on the intake strip, no unattended write");
    check(!(await onDisk()).includes("scratch-2.txt"), "nothing written before the tap");
    await page.click("#intakeBtn");
    await page.waitForFunction(() => !window.__kaburi.intake());
    await page.waitForTimeout(200);
    let disk2 = await onDisk();
    check(disk2.includes("scratch-2.txt"), "tap on the strip lands the files");
    /* installed app window: zero-click */
    await page.evaluate(async () => { const d = await navigator.storage.getDirectory(); for (const n of ["scratch-2.txt", "my notes 2.md", "evil.md", "noext.md"]) { try { await d.removeEntry(n); } catch (e) {} } });
    await page.addInitScript(() => { window.__kaburiDisplayMode = "standalone"; });
    tok = await park([["scratch.txt", "shared body"], ["my notes 2.md", "# spaced"], ["../../evil<>.md", "x"], ["noext", "y"]], "");
    await page.goto(base + "/?share-target=" + tok);
    await page.waitForFunction(() => window.__kaburi && window.__kaburi.state() === "ready" && location.search === "" && !window.__kaburi.intake());
    await page.waitForTimeout(300);
    disk2 = await onDisk();
    check(await page.$eval("#intake", (e) => e.hidden), "app window: files land without a tap");
    check(disk2.includes("scratch-2.txt") && disk2.includes("scratch.txt"), "shared duplicate gets -2 suffix, original untouched " + JSON.stringify(disk2));
    check(disk2.includes("my notes 2.md"), "spaces in a shared name survive the header round trip");
    check(disk2.includes("evil.md") && !disk2.some((n) => n.includes("..")), "path bits and control chars stripped");
    check(disk2.includes("noext.md"), "extension-less share becomes .md");
    check(await page.evaluate(async () => !(await caches.has("kaburi-share"))), "share cache cleared after landing");
    check(await page.evaluate(() => location.search === "" && !document.getElementById("intake").hidden === false), "url cleaned, intake bar hidden");
    await page.reload(); await page.waitForFunction(() => window.__kaburi && window.__kaburi.state() === "ready");
    check((await onDisk()).filter((n) => n.startsWith("scratch")).length === 2, "reload does not land again");
    tok = await park([], "sk-ant-shared\nhttps://example.com");
    await page.goto(base + "/?share-target=" + tok);
    await page.waitForFunction(() => window.__kaburi && location.search === "");
    check(await page.evaluate(() => window.__kaburi.notes().length === 1 && window.__kaburi.notes()[0].text.includes("example.com")), "shared text becomes a note");
    check(await page.$eval("#tab-notes", (e) => e.getAttribute("aria-selected")) === "true", "text share opens the notes tab");
    /* no folder yet: intake bar waits, cache kept */
    await page.evaluate(async () => { indexedDB.deleteDatabase("kaburi"); });
    tok = await park([["later.md", "later"]], "");
    await page.goto(base + "/?share-target=" + tok);
    await page.waitForFunction(() => window.__kaburi && location.search === "" && window.__kaburi.intake());
    check(!(await page.$eval("#intake", (e) => e.hidden)) && /later\.md/.test(await page.$eval("#intakeNames", (e) => e.textContent)), "no folder: intake bar lists the file and waits");
    check(await page.evaluate(async () => await caches.has("kaburi-share")), "cache kept while waiting for a folder");
    await page.evaluate(async () => { await window.__kaburi.useDir(await navigator.storage.getDirectory()); });
    await page.waitForFunction(() => !window.__kaburi.intake());
    check((await onDisk()).includes("later.md"), "choosing a folder lands the waiting file");
    await page.click("#tab-files");

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
        const c = await caches.open("kaburi-v4"); const k = await c.keys();
        if (k.length >= 8 && navigator.serviceWorker.controller) return k.map((r) => new URL(r.url).pathname);
        await new Promise((r) => setTimeout(r, 100));
      }
      return [];
    });
    await page.reload();
    check(keys.includes("/") && keys.includes("/app.js"), "sw precached the shell " + JSON.stringify(keys));
    await page.goto(base + "/icon-192.png");
    await page.waitForTimeout(300);
    const shellType = await page.evaluate(async () => {
      const r = await (await caches.open("kaburi-v4")).match("/");
      return r ? (r.headers.get("content-type") || "none") : "missing";
    });
    check(/text\/html/i.test(shellType), "navigating straight to a subresource does not become the offline shell (" + shellType + ")");

    /* The runtime cache has to actually write. Until 2026-09-04 it never did: the fetch handler
       called r.clone() inside the caches.open() callback, i.e. after respondWith() had already
       locked the body — every put() rejected with "Response body is already used", unhandled and
       invisible. Both checks above still passed, because PRECACHE alone satisfies them: the shell
       was cached at install time, and a subresource that never gets stored also never becomes the
       shell. So assert the thing PRECACHE cannot fake — that a fresh online load updates what is
       in the cache. Serve a marker, load it, and require the cached copy to carry it. */
    await page.goto(base + "/");
    const runtimeWrote = await page.evaluate(async () => {
      const url = "/app.js?cachecheck=" + Date.now();
      const live = await (await fetch(url)).text();
      for (let i = 0; i < 40; i++) {
        const hit = await (await caches.open("kaburi-v4")).match(url);
        if (hit) return (await hit.text()) === live;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    });
    check(runtimeWrote, "runtime cache actually stores what was fetched online (clone before respondWith)");

    await page.goto(base + "/");
    /* Drive the worker the way the attack does: a form POST from a different origin.
       Our own CSP (form-action 'none') forbids submitting such a form from a Kaburi page. */
    const navs = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    check(await page.evaluate(async () => (await fetch("/share", { method: "POST", body: new FormData() })).status) === 404,
      "a non-navigation POST to /share is not treated as a share");
    const evil = http.createServer((q, r) => {
      r.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      r.end('<!doctype html><meta charset="utf-8"><form id="f" method="POST" enctype="multipart/form-data" action="' + base + '/share">' +
        '<input type="file" name="files"><input name="title" value="T"><input name="url" value="https://x.test"></form>' +
        '<script>const dt=new DataTransfer();dt.items.add(new File(["# hi"],"\u4e2d\u6587\u7b46\u8a18.md",{type:"text/markdown"}));' +
        'f.files.files=dt.files;setTimeout(()=>f.submit(),0);<\/script>');
    });
    await new Promise((r) => evil.listen(0, "127.0.0.1", r));
    await page.goto(`http://127.0.0.1:${evil.address().port}/`);
    await page.waitForFunction(() => window.__kaburi && window.__kaburi.intake(), null, { timeout: 20000 });
    const meta = await page.evaluate(async () => {
      const c = await caches.open("kaburi-share");
      const m = await (await c.match("/__share/meta")).json();
      const f = await c.match("/__share/file-0");
      return { m, name: f && decodeURIComponent(f.headers.get("x-kaburi-name")), body: f && await f.text() };
    });
    check(meta.m.count === 1 && meta.m.text === "T\nhttps://x.test" && meta.name === "中文筆記.md" && meta.body === "# hi",
      "sw parks a navigational POST /share, CJK name round-trips " + JSON.stringify(meta));
    check(!!meta.m.nonce && navs.some((u) => u.includes("share-target=" + encodeURIComponent(meta.m.nonce))),
      "the redirect carries the payload's own launch token");
    check(!(await page.$eval("#intake", (e) => e.hidden)), "a cross-site POST lands on the intake strip, never written unattended");
    evil.close();

    await ctx.setOffline(true);
    const r = await page.reload().catch(() => null);
    check(!!r && (await page.isVisible(".wordmark")), "shell loads offline");
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails.length ? `\n${fails.length} failure(s)` : "\nall green");
  process.exit(fails.length ? 1 : 0);
})();
