/* js: app — Kaburi. One folder, a counter, a stage. */
(function () {
"use strict";
var $ = function (i) { return document.getElementById(i); };
var root = document.documentElement;
var HAS_FS = typeof window.showDirectoryPicker === "function";
var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/* js: i18n */
var STR = {
 en: {items: "%n items", rename: "Tap to rename", view: "view", edit: "edit", save: "Save",
  strip: "Single-file preview — external CSS and images won't load.",
  notes: "Notes", swipe: "swipe either way to toss",
  ephem: "<b>Gone when you close.</b> Notes live in memory only — never written to disk, never stored, never synced.",
  ph: "Paste. Use. Swipe away.", copy: "Copy", toss: "Copy & toss", tossLbl: "toss",
  empty: "Tap + to open one. Swipe it away when you're done.",
  noFiles: "Nothing on the counter. Tap + for a clean board.", newFile: "New board",
  pick: "pick a slice", ch: "%n ch", tabF: "Files", tabN: "Notes",
  showAll: "Everything in this folder", scopeAll: "all %n", scopeRecent: "recent",
  stow: "stow", unstow: "back", stowed: "Stowed", unstowed: "Back on the counter",
  rowStow: "Swipe, or press \u2190 \u2192, to stow", rowUnstow: "Swipe, or press \u2190 \u2192, to bring back",
  tooBig: "Over 1 MB — too big to open here.", notUtf8: "Not UTF-8 — this one is read only.",
  badJson: "Can't parse this JSON — showing it as written.", csvHeader: "First row is a header",
  tooDeep: "Too many rows to lay out — showing it as text.",
  saved: "Saved", renamed: "Renamed → %s", copied: "Copied", copiedToss: "Copied, note tossed",
  today: "Today", yday: "Yesterday", other: "中",
  noFolder: "no folder", changeFolder: "Tap to change folder",
  pickFolder: "Choose a folder",
  pickHint: "Kaburi works on one folder. Pick where your md / html / txt files live.",
  reauth: "Re-authorize", reauthHint: "Folder access needs one tap after reopening.",
  unsupported: "This browser can't open local folders. Use Chrome 132+ or Edge on desktop, ChromeOS or Android.",
  overwrite: "\u201C%s\u201D already exists. Overwrite it?",
  badName: "Keep it .md, .html or .txt — no slashes.",
  sameFile: "That name is the same file here.",
  failed: "Failed: %s", denied: "Folder access was not granted.",
  loose: "Opened from outside the folder — rename is off.",
  fullscreen: "Fullscreen", top: "Top",
  intakeTo: "Save to %s", intakePick: "Choose a folder", intakeOne: "1 file shared in", intakeN: "%n files shared in",
  intakeText: "Text shared in", intakeNote: "Keep as note",
  landed: "On the counter: %s", landedN: "%n on the counter"},
 zh: {items: "%n 份", rename: "點一下改名", view: "看", edit: "改", save: "存",
  strip: "單檔預覽 — 外部 CSS 與圖片不會載入。",
  notes: "便條", swipe: "左右滑都能丟掉",
  ephem: "<b>關掉就沒了。</b>便條只在記憶體裡，不寫磁碟、不存、不同步。",
  ph: "貼上。用完。滑掉。", copy: "複製", toss: "複製並丟掉", tossLbl: "丟",
  empty: "按 + 開一張。用完滑掉。",
  noFiles: "檯面上沒東西。按 + 拿一塊新板子。", newFile: "新板子",
  pick: "選一片", ch: "%n 字", tabF: "檔案", tabN: "便條",
  showAll: "這個資料夾裡的全部", scopeAll: "全部 %n", scopeRecent: "最近",
  stow: "下檯", unstow: "回檯", stowed: "已下檯", unstowed: "回到檯面",
  rowStow: "左右滑，或按 \u2190 \u2192，下檯", rowUnstow: "左右滑，或按 \u2190 \u2192，回檯",
  tooBig: "超過 1 MB，這裡不開。", notUtf8: "這個檔不是 UTF-8，只能看。",
  badJson: "這份 JSON 解析不了，照原樣顯示。", csvHeader: "第一列是表頭",
  tooDeep: "筆數太多排不開，改用文字顯示。",
  saved: "已存回", renamed: "改名 → %s", copied: "已複製", copiedToss: "已複製，便條丟了",
  today: "今天", yday: "昨天", other: "EN",
  noFolder: "沒有資料夾", changeFolder: "點一下換資料夾",
  pickFolder: "選一個資料夾",
  pickHint: "Kaburi 只處理一個資料夾。選你放 md / html / txt 的地方。",
  reauth: "重新授權", reauthHint: "重開之後要按一下才能再碰資料夾。",
  unsupported: "這個瀏覽器不能開本機資料夾。請用桌機、ChromeOS 或 Android 上的 Chrome 132+ 或 Edge。",
  overwrite: "「%s」已經存在，覆蓋掉它？",
  badName: "只能是 .md、.html、.txt，不能有斜線。",
  sameFile: "這個名字在這裡就是同一個檔。",
  failed: "失敗：%s", denied: "沒有拿到資料夾的權限。",
  loose: "從資料夾外開的檔案，不能改名。",
  fullscreen: "全螢幕", top: "回頂端",
  intakeTo: "存到 %s", intakePick: "選一個工作資料夾", intakeOne: "分享進來 1 份", intakeN: "分享進來 %n 份",
  intakeText: "分享進來一段文字", intakeNote: "開成便條",
  landed: "已上檯 %s", landedN: "已上檯 %n 份"}
};
var PREF = {
 get: function (k, d) { try { var v = localStorage.getItem("kaburi." + k); return v === null ? d : v; } catch (e) { return d; } },
 set: function (k, v) { try { localStorage.setItem("kaburi." + k, v); } catch (e) {} }
};
var csvHeader = PREF.get("csvHeader", "1") !== "0";
var lang = PREF.get("lang", "en");
if (lang !== "zh") lang = "en";
function t(k, v) {
 var s = STR[lang][k] || k;
 /* function form: a value holding $&, $` or $' must not be read as a replacement pattern */
 if (v !== undefined) s = s.replace("%n", function () { return v; }).replace("%s", function () { return v; });
 return s;
}

function applyLang() {
 root.setAttribute("data-lang", lang);
 root.setAttribute("lang", lang === "zh" ? "zh-Hant-TW" : "en");
 $("langBtn").textContent = t("other");
 $("nTitle").textContent = t("notes");
 $("nHint").textContent = t("swipe");
 $("ephem").innerHTML = t("ephem");
 $("tabF").textContent = t("tabF");
 $("tabN").textContent = t("tabN");
 $("stage").dataset.empty = t("pick");
 $("fsBtn").setAttribute("aria-label", t("fullscreen"));
 $("totop").setAttribute("aria-label", t("top"));
 paintIntake();
 paintStatus(); paintList(); paintNotes();
 if (cur) render();
}

/* js: layout — app (default) / tablet (fullscreen only) */
var fsQuery = window.matchMedia("(display-mode: fullscreen)");
function inFullscreen() { return !!document.fullscreenElement || fsQuery.matches; }
/* fullscreen is the intent; the width floor only stops a phone in fullscreen from getting three columns in 412px */
var TABLET_MIN = 700;
function applyLayout() { root.setAttribute("data-layout", inFullscreen() && window.innerWidth >= TABLET_MIN ? "tablet" : "app"); }
function toggleFullscreen() {
 if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); }
 else if (root.requestFullscreen) { root.requestFullscreen().catch(function () {}); }
}

/* js: theme */
var SUN = '<path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>';
var MOON = '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
function setTheme(th, persist) {
 root.setAttribute("data-theme", th);
 $("themeIcon").innerHTML = th === "dark" ? MOON : SUN;
 if (persist) PREF.set("theme", th);
}

/* js: idb — the folder handle survives a reload here */
var DB = "kaburi", STORE = "handles";
function idb() {
 return new Promise(function (res, rej) {
  var r = indexedDB.open(DB, 1);
  r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
  r.onsuccess = function () { res(r.result); };
  r.onerror = function () { rej(r.error); };
 });
}
function idbGet(k) {
 return idb().then(function (db) {
  return new Promise(function (res, rej) {
   var rq = db.transaction(STORE, "readonly").objectStore(STORE).get(k);
   rq.onsuccess = function () { res(rq.result); };
   rq.onerror = function () { rej(rq.error); };
  });
 }).catch(function () { return undefined; });
}
function idbSet(k, v) {
 return idb().then(function (db) {
  return new Promise(function (res, rej) {
   var tx = db.transaction(STORE, "readwrite");
   tx.objectStore(STORE).put(v, k);
   tx.oncomplete = function () { res(); };
   tx.onerror = function () { rej(tx.error); };
  });
 }).catch(function () {});
}

/* js: folder */
var dirHandle = null, FILES = [], RECENT = 5, expanded = false;
var folderState = HAS_FS ? "restoring" : "unsupported";   /* restoring | none | needauth | ready | unsupported */
/* js: types — one table. `cls` drives the colour band, `view` picks the renderer, and `open` follows
   a rule rather than taste: a view that differs from the source opens in view, one that does not
   opens in edit. The allowlist's job is not "formats we support", it is "files we can write back
   without destroying them" — which is why binaries are absent and why encoding matters (see save). */
var TYPES = {
 md:       {cls: "doc",   view: "markdown", open: "view"},
 markdown: {cls: "doc",   view: "markdown", open: "view"},
 html:     {cls: "page",  view: "sandbox",  open: "view"},
 htm:      {cls: "page",  view: "sandbox",  open: "view"},
 txt:      {cls: "plain", view: "plain",    open: "edit"},
 log:      {cls: "plain", view: "plain",    open: "edit"},
 json:     {cls: "data",  view: "json",     open: "view"},
 csv:      {cls: "data",  view: "table",    open: "view"},
 yaml:     {cls: "data",  view: "plain",    open: "edit", tint: "yaml"},
 yml:      {cls: "data",  view: "plain",    open: "edit", tint: "yaml"}
};
var MAX_OPEN = 1048576;          /* 1 MB: above this we do not open at all, no renderer can save a phone from it */
function typeOf(name) {
 var m = /\.([a-z0-9]+)$/i.exec(name);
 return m ? (TYPES[m[1].toLowerCase()] || null) : null;
}

/* Bytes the user did not touch must survive a round trip. The decoder strips a BOM and a textarea
   normalises CRLF to LF, so both are remembered here and restored on write. */
function decodeFile(buf) {
 var b = new Uint8Array(buf);
 var bom = b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
 var body, readonly = false;
 try { body = new TextDecoder("utf-8", {fatal: true}).decode(buf); }
 catch (e) { body = new TextDecoder("utf-8").decode(buf); readonly = true; }
 if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
 var crlf = /\r\n/.test(body);
 if (crlf) body = body.replace(/\r\n/g, "\n");
 return {body: body, bom: bom, eol: crlf ? "\r\n" : "\n", readonly: readonly};
}
function fmtSize(n) {
 if (n < 1024) return n + " B";
 if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
 return (n / 1048576).toFixed(1) + " MB";
}
function errMsg(e) { return (e && (e.message || e.name)) || String(e); }
function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

async function scan() {
 if (!dirHandle) return;
 var out = [];
 try {
  for await (var entry of dirHandle.values()) {
   if (entry.kind !== "file") continue;
   var ty = typeOf(entry.name); if (!ty) continue;
   var file;
   try { file = await entry.getFile(); } catch (e) { continue; }
   if (cur && !cur.loose && cur.name === entry.name) {
    cur.handle = entry; cur.type = ty; cur.ts = file.lastModified; cur.size = file.size;
    out.push(cur);
   } else {
    out.push({name: entry.name, type: ty, ts: file.lastModified, size: file.size, handle: entry});
   }
  }
 } catch (e) {
  if (e && e.name === "NotAllowedError") { folderState = "needauth"; paintStatus(); paintList(); return; }
  flash(t("failed", errMsg(e)));
 }
 FILES = out;
 paintStatus(); paintList();
}

async function useDir(h) {
 dirHandle = h; folderState = "ready"; expanded = false; FILES = [];
 await idbSet("dir", h);
 await scan();
 if (intake) await landFiles();
}
async function pickFolder() {
 var opts = {mode: "readwrite", id: "kaburi", startIn: dirHandle || "downloads"};
 var h;
 try { h = await window.showDirectoryPicker(opts); }
 catch (e) { if (e && e.name !== "AbortError") flash(t("failed", errMsg(e))); return; }
 await useDir(h);
}
async function reauth() {
 if (!dirHandle) return pickFolder();
 try {
  var p = await dirHandle.requestPermission({mode: "readwrite"});
  if (p === "granted") { folderState = "ready"; await scan(); if (intake) await landFiles(); }
  else flash(t("denied"));
 } catch (e) { flash(t("failed", errMsg(e))); }
}
async function restoreDir() {
 var h = await idbGet("dir");
 if (!h) { folderState = "none"; return; }
 dirHandle = h;
 try {
  var p = await h.queryPermission({mode: "readwrite"});
  if (p !== "granted") {
   /* Chrome 122+ persistent permission: an installed app that was granted once may be re-granted
      without a prompt. Without user activation Chrome either grants silently or rejects; a reject
      just means the tap-to-reauthorize state below. Never shows a prompt here. */
   try { p = await h.requestPermission({mode: "readwrite"}); } catch (e) {}
  }
  if (p === "granted") { folderState = "ready"; await scan(); return; }
 } catch (e) {}
 folderState = "needauth";
}
var rescanTimer = null;
function rescanSoon() {
 if (folderState !== "ready") return;
 clearTimeout(rescanTimer);
 rescanTimer = setTimeout(function () { scan(); }, 150);
}

/* js: stowed — {name: mtime}; a file edited after being stowed heals itself back */
var archived = {};
try { archived = JSON.parse(localStorage.getItem("kaburi.stowed") || "{}") || {}; } catch (e) {}
function saveStowed() { try { localStorage.setItem("kaburi.stowed", JSON.stringify(archived)); } catch (e) {} }
function isStowed(f) {
 var at = archived[f.name];
 if (at === undefined) return false;
 if (f.ts > at) { delete archived[f.name]; saveStowed(); return false; }
 return true;
}

/* js: md */
function esc(s) {
 return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeHref(u) { return /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(u) ? u : "#"; }
function inl(s) {
 return s
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, a, b) {
   return '<a href="' + safeHref(b) + '" target="_blank" rel="noopener noreferrer">' + a + "</a>"; })
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}
function md(src) {
 var L = esc(src.replace(/\r\n?/g, "\n")).split("\n"), o = [], i = 0, p = [];
 function fp() { if (p.length) { o.push("<p>" + inl(p.join("<br>")) + "</p>"); p = []; } }
 while (i < L.length) {
  var l = L[i];
  if (/^\s*```/.test(l)) { fp(); var b = []; i++; while (i < L.length && !/^\s*```/.test(L[i])) { b.push(L[i]); i++; } i++;
   o.push("<pre><code>" + b.join("\n") + "</code></pre>"); continue; }
  if (/\|/.test(l) && i + 1 < L.length && /^\s*\|?[\s:\-|]+\|[\s:\-|]*$/.test(L[i + 1])) {
   fp(); var c = function (r) { return r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (x) { return inl(x.trim()); }); };
   var h = c(l); i += 2; var rs = []; while (i < L.length && /\|/.test(L[i]) && L[i].trim()) { rs.push(c(L[i])); i++; }
   var tb = "<table><thead><tr>" + h.map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr></thead><tbody>";
   rs.forEach(function (r) { tb += "<tr>" + r.map(function (x) { return "<td>" + x + "</td>"; }).join("") + "</tr>"; });
   o.push(tb + "</tbody></table>"); continue; }
  var hd = l.match(/^(#{1,6})\s+(.*)$/);
  if (hd) { fp(); o.push("<h" + hd[1].length + ">" + inl(hd[2]) + "</h" + hd[1].length + ">"); i++; continue; }
  if (/^\s*([-*_]\s*){3,}$/.test(l)) { fp(); o.push("<hr>"); i++; continue; }
  if (/^\s*&gt;\s?/.test(l)) { fp(); var q = []; while (i < L.length && /^\s*&gt;\s?/.test(L[i])) { q.push(L[i].replace(/^\s*&gt;\s?/, "")); i++; }
   o.push("<blockquote>" + mdEscaped(q.join("\n")) + "</blockquote>"); continue; }
  if (/^\s*([-*+]|\d+\.)\s+/.test(l)) { fp(); var ord = /^\s*\d+\./.test(l), it = [];
   while (i < L.length && /^\s*([-*+]|\d+\.)\s+/.test(L[i])) { it.push(inl(L[i].replace(/^\s*([-*+]|\d+\.)\s+/, ""))); i++; }
   o.push("<" + (ord ? "ol" : "ul") + ">" + it.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</" + (ord ? "ol" : "ul") + ">"); continue; }
  if (!l.trim()) { fp(); i++; continue; }
  p.push(l); i++;
 }
 fp(); return o.join("\n");
}
/* blockquote bodies are already escaped once; unescape before the recursive pass so nothing is double-escaped */
function mdEscaped(s) {
 return md(s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
}

/* js: list */
var NOW = Date.now(), H = 3600000;
function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
function dayLabel(ts) {
 var d = new Date(ts);
 if (dayKey(ts) === dayKey(NOW)) return t("today");
 if (dayKey(ts) === dayKey(NOW - 24 * H)) return t("yday");
 return lang === "zh"
  ? d.toLocaleDateString("zh-TW", {month: "numeric", day: "numeric"})
  : d.toLocaleDateString("en-US", {month: "short", day: "numeric"});
}
function clockOf(ts) {
 return new Date(ts).toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-US",
  {hour: "2-digit", minute: "2-digit", hour12: false});
}

function paintStatus() {
 var wd = $("wd");
 wd.textContent = dirHandle ? (dirHandle.name || "/") : (folderState === "restoring" ? "" : t("noFolder"));
 wd.title = t("changeFolder");
 wd.classList.toggle("none", !dirHandle);
 wd.disabled = !HAS_FS;
 $("addFile").hidden = folderState !== "ready";
}

function rowFor(f, withDate) {
 var b = document.createElement("button"); b.className = "slice";
 /* f.type.cls is interpolated into innerHTML, so it must only ever come from the TYPES table */
 b.innerHTML = '<span class="cut ' + (f.type ? f.type.cls : "other") + '"></span><span class="t"><b></b><small></small></span>' +
  '<svg class="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 6l6 6-6 6"/></svg>';
 b.querySelector("b").textContent = f.name;
 b.querySelector("small").textContent =
  (f.fresh ? "—" : (withDate ? dayLabel(f.ts) + " " : "") + clockOf(f.ts)) + "  ·  " + fmtSize(f.size);
 var moved = false;
 b.addEventListener("click", function () { if (!moved) openFile(f); });

 var sl = document.createElement("span"); sl.className = "stow l";
 var sr = document.createElement("span"); sr.className = "stow r";
 var on = isStowed(f);
 sl.textContent = sr.textContent = t(on ? "unstow" : "stow");
 b.appendChild(sl); b.appendChild(sr);
 if (on) b.classList.add("stowed");
 /* the swipe must not be the only way off the counter: the arrow keys are its keyboard twin */
 b.title = t(on ? "rowUnstow" : "rowStow");
 b.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
 b.addEventListener("keydown", function (e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault(); stow(f);
 });

 var x0 = 0, dx = 0, drag = false, lock = null, y0 = 0;
 b.addEventListener("pointerdown", function (e) {
  drag = true; moved = false; lock = null; x0 = e.clientX; y0 = e.clientY; dx = 0; b.style.transition = "none"; });
 b.addEventListener("pointermove", function (e) {
  if (!drag) return;
  var ax = e.clientX - x0, ay = e.clientY - y0;
  if (lock === null && (Math.abs(ax) > 7 || Math.abs(ay) > 7)) lock = Math.abs(ax) > Math.abs(ay) ? "x" : "y";
  if (lock !== "x") return;
  moved = true; dx = ax; b.style.transform = "translateX(" + dx + "px)";
  var pr = Math.min(1, Math.abs(dx) / 95);
  sl.style.opacity = dx > 0 ? String(pr) : "0";
  sr.style.opacity = dx < 0 ? String(pr) : "0"; });
 function end() {
  if (!drag) return; drag = false;
  b.style.transition = "transform .2s cubic-bezier(.32,.72,0,1),opacity .2s";
  if (Math.abs(dx) > 95) stow(f);
  else { b.style.transform = ""; sl.style.opacity = "0"; sr.style.opacity = "0";
   setTimeout(function () { moved = false; }, 60); } }
 b.addEventListener("pointerup", end);
 b.addEventListener("pointercancel", end);
 b.addEventListener("pointerleave", end);
 return b;
}

function stow(f) {
 var rows = $("rows"), at = -1, live = document.activeElement;
 if (live && live.classList && live.classList.contains("slice")) {
  at = Array.prototype.indexOf.call(rows.querySelectorAll(".slice"), live);
 }
 var on = isStowed(f);
 if (on) delete archived[f.name]; else archived[f.name] = f.ts;
 saveStowed();
 vibrate(10);
 flash(t(on ? "unstowed" : "stowed"));
 paintList();
 if (at >= 0) {                 /* the list was rebuilt; keep the keyboard where it was */
  var after = rows.querySelectorAll(".slice");
  var next = after[Math.min(at, after.length - 1)];
  if (next) next.focus();
 }
}

function emptyPane(html) {
 var e = document.createElement("div"); e.className = "emptypane"; e.innerHTML = html; return e;
}
function paintList() {
 var h = $("rows"); h.textContent = "";
 var scope = $("scope");
 if (folderState !== "ready") {
  scope.hidden = true;
  if (folderState === "restoring") return;   /* handle + permission still coming back; no flash of empty state */
  if (folderState === "unsupported") { h.appendChild(emptyPane("")).textContent = t("unsupported"); return; }
  if (folderState === "needauth") {
   var e = emptyPane("<b></b><span></span><br><button class=\"btn\" id=\"reauth\"></button>");
   e.querySelector("b").textContent = dirHandle ? dirHandle.name : "";
   e.querySelector("span").textContent = t("reauthHint");
   e.querySelector("button").textContent = t("reauth");
   e.addEventListener("click", reauth);
   e.classList.add("tap");
   h.appendChild(e); return;
  }
  var p = emptyPane("<span></span><br><button class=\"btn\" id=\"pick\"></button>");
  p.querySelector("span").textContent = t("pickHint");
  p.querySelector("button").textContent = t("pickFolder");
  p.querySelector("button").addEventListener("click", pickFolder);
  h.appendChild(p); return;
 }

 var live = FILES.filter(function (f) { return !isStowed(f); });
 scope.textContent = expanded ? t("scopeRecent") : t("scopeAll", FILES.length);
 scope.hidden = (FILES.length <= RECENT) && (live.length === FILES.length);
 if (!FILES.length) { h.appendChild(emptyPane("")).textContent = t("noFiles"); return; }

 var sorted = (expanded ? FILES : live).slice().sort(function (a, b) { return b.ts - a.ts; });
 var shown = expanded ? sorted : sorted.slice(0, RECENT);
 var last = null;
 shown.forEach(function (f) {
  if (!expanded) {
   var k = dayKey(f.ts);
   if (k !== last) {
    last = k;
    var lab = document.createElement("div"); lab.className = "daylabel";
    lab.textContent = dayLabel(f.ts); h.appendChild(lab); } }
  h.appendChild(rowFor(f, expanded)); });

 if (!expanded && FILES.length > shown.length) {
  var m = document.createElement("button"); m.className = "more";
  m.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span></span><em></em>';
  m.querySelector("span").textContent = t("showAll");
  m.querySelector("em").textContent = (FILES.length - shown.length) + "+";
  m.addEventListener("click", function () { expanded = true; paintList(); });
  h.appendChild(m); }
}

/* js: stage */
var cur = null, mode = "view", dirty = false;
async function openFile(f) {
 if (!(cur === f && dirty)) {
  if (f.size > MAX_OPEN) { flash(t("tooBig")); return; }   /* before the read, not after */
  try {
   var d = decodeFile(await (await f.handle.getFile()).arrayBuffer());
   f.body = d.body; f.bom = d.bom; f.eol = d.eol; f.readonly = d.readonly;
  } catch (e) { flash(t("failed", errMsg(e))); return; }
 }
 cur = f; dirty = false;
 mode = f.readonly ? "view" : (f.type ? f.type.open : "edit");
 showTab("files");
 $("stage").classList.add("open"); render();
 if (f.loose) flash(t("loose"));
}
function closeStage() { $("stage").classList.remove("open"); }
function toTop() {
 var ta = $("src"); if (!ta) return;
 ta.focus({preventScroll: true});
 ta.setSelectionRange(0, 0);
 ta.scrollTop = 0; $("sbody").scrollTop = 0; window.scrollTo(0, 0);
}

function render() {
 var f = cur; if (!f) return;
 var fn = $("fname");
 if (fn.tagName === "BUTTON") { fn.textContent = f.name; fn.title = f.loose ? t("loose") : t("rename"); }
 $("vtog").dataset.mode = mode;
 $("vlbl").textContent = t(mode);
 $("vtog").disabled = !!f.readonly;   /* not just hiding Save: nobody should type before finding out */
 $("save").textContent = t("save");
 $("save").hidden = !(mode === "edit" && dirty) || !!f.readonly;
 var body = $("sbody"); body.textContent = "";
 $("totop").hidden = mode !== "edit";

 if (mode === "edit") {
  var ta = document.createElement("textarea"); ta.id = "src"; ta.spellcheck = false; ta.value = f.body;
  ta.addEventListener("input", function () { f.body = ta.value; if (!dirty) { dirty = true; $("save").hidden = false; } });
  body.appendChild(ta); return; }

 if (f.readonly) body.appendChild(strip(t("notUtf8")));

 var view = f.type ? f.type.view : "plain";

 if (view === "sandbox") {
  body.appendChild(strip(t("strip")));
  var fr = document.createElement("iframe"); fr.className = "preview";
  fr.setAttribute("sandbox", "");            /* never add allow-same-origin next to allow-scripts */
  fr.setAttribute("referrerpolicy", "no-referrer");
  fr.srcdoc = '<meta charset="utf-8"><style>body{font:18px/1.8 system-ui;padding:22px;color:#182126;background:#fff}img{max-width:100%}@media(max-width:600px){body{font-size:20.7px}}</style>' + f.body;
  body.appendChild(fr); return; }

 if (view === "markdown") {
  var d = document.createElement("div"); d.className = "read"; d.innerHTML = md(f.body);
  body.appendChild(d); return; }

 if (view === "json") {
  var parsed;
  try { parsed = JSON.parse(f.body); }
  catch (e) { body.appendChild(strip(t("badJson"))); body.appendChild(plainView(f.body)); return; }
  if (countNodes(parsed) > MAX_NODES) {   /* a deep 1 MB document would build 100k+ nodes */
   body.appendChild(strip(t("tooDeep")));
   body.appendChild(plainView(JSON.stringify(parsed, null, 2))); return; }
  var tree = document.createElement("div"); tree.className = "jsontree";
  tree.appendChild(jsonNode(parsed, null)); body.appendChild(tree); return; }

 if (view === "table") {
  var rows = parseCsv(f.body);
  if (!rows.length) { body.appendChild(plainView(f.body)); return; }
  var cells = 0;
  for (var ri = 0; ri < rows.length; ri++) cells += rows[ri].length;
  if (cells > MAX_NODES) { body.appendChild(strip(t("tooDeep"))); body.appendChild(plainView(f.body)); return; }
  body.appendChild(csvBar());
  body.appendChild(csvTable(rows)); return; }

 body.appendChild(plainView(f.body, f.type && f.type.tint));
}

/* js: renderers — everything below builds DOM with textContent. The markdown renderer is the only
   path in this app allowed to touch innerHTML, and it escapes its input; do not add a second one. */
function strip(msg) {
 var w = document.createElement("div"); w.className = "strip"; w.textContent = msg; return w;
}
function plainView(text, tint) {
 var pre = document.createElement("pre"); pre.className = "plainread";
 if (tint !== "yaml") { pre.textContent = text; return pre; }
 /* Line-based tinting only. It never claims to understand YAML's structure, so it cannot be wrong
    about anchors, multi-line scalars or flow style the way a subset parser would be. */
 text.split("\n").forEach(function (line, i) {
  if (i) pre.appendChild(document.createTextNode("\n"));
  var m = /^(\s*)(#.*)$/.exec(line);
  if (m) { pre.appendChild(document.createTextNode(m[1])); pre.appendChild(span("ycom", m[2])); return; }
  m = /^(\s*)(-\s+)?([^:#\s][^:#]*)(:)(\s*)(.*)$/.exec(line);
  if (m) {
   pre.appendChild(document.createTextNode(m[1]));
   if (m[2]) pre.appendChild(span("ymark", m[2]));
   pre.appendChild(span("ykey", m[3]));
   pre.appendChild(span("jpunc", m[4]));
   pre.appendChild(document.createTextNode(m[5]));
   if (m[6]) pre.appendChild(span("yval", m[6]));
   return; }
  m = /^(\s*)(-\s+)(.*)$/.exec(line);
  if (m) {
   pre.appendChild(document.createTextNode(m[1]));
   pre.appendChild(span("ymark", m[2]));
   pre.appendChild(span("yval", m[3])); return; }
  pre.appendChild(document.createTextNode(line));
 });
 return pre;
}
function span(cls, text) {
 var e = document.createElement("span"); e.className = cls; e.textContent = text; return e;
}

/* js: json tree — structure plus one emphasis colour. All textContent. */
var MAX_NODES = 4000;
function countNodes(v) {
 if (v === null || typeof v !== "object") return 1;
 var n = 1;
 var keys = Array.isArray(v) ? v : Object.keys(v).map(function (k) { return v[k]; });
 for (var i = 0; i < keys.length; i++) {
  n += countNodes(keys[i]);
  if (n > MAX_NODES) return n;
 }
 return n;
}
function jsonScalar(v) {
 if (typeof v === "string") return JSON.stringify(v);
 return String(v);
}
function jsonNode(v, key) {
 if (v === null || typeof v !== "object") {
  var row = document.createElement("div"); row.className = "jrow";
  if (key !== null) { row.appendChild(span("jkey", key)); row.appendChild(span("jpunc", ": ")); }
  row.appendChild(span("jval", jsonScalar(v)));
  return row;
 }
 var arr = Array.isArray(v);
 var entries = arr ? v.map(function (x, i) { return [String(i), x]; })
                   : Object.keys(v).map(function (k) { return [k, v[k]]; });
 var d = document.createElement("details"); d.open = true;
 var sm = document.createElement("summary");
 if (key !== null) { sm.appendChild(span("jkey", key)); sm.appendChild(span("jpunc", ": ")); }
 sm.appendChild(span("jpunc", arr ? "[" : "{"));
 sm.appendChild(span("jcount", " " + entries.length + " "));
 sm.appendChild(span("jpunc", arr ? "]" : "}"));
 d.appendChild(sm);
 var kids = document.createElement("div"); kids.className = "jkids";
 entries.forEach(function (e) { kids.appendChild(jsonNode(e[1], e[0])); });
 d.appendChild(kids);
 return d;
}

/* Quoted fields may hold commas, newlines and doubled quotes. Body arrives with CRLF already
   normalised, so only "\n" needs handling here. */
function parseCsv(text) {
 var rows = [], row = [], cell = "", quoted = false, i = 0;
 while (i < text.length) {
  var c = text.charAt(i);
  if (quoted) {
   if (c === '"') {
    if (text.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
    quoted = false; i++; continue; }
   cell += c; i++; continue; }
  if (c === '"') { quoted = true; i++; continue; }
  if (c === ",") { row.push(cell); cell = ""; i++; continue; }
  if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
  cell += c; i++;
 }
 if (cell.length || row.length) { row.push(cell); rows.push(row); }
 return rows;
}
function csvBar() {
 var lab = document.createElement("label"); lab.className = "csvbar";
 var box = document.createElement("input"); box.type = "checkbox"; box.checked = csvHeader;
 var txt = document.createElement("span"); txt.textContent = t("csvHeader");
 box.addEventListener("change", function () {
  csvHeader = box.checked; PREF.set("csvHeader", csvHeader ? "1" : "0");
  render();                                  /* redraw from memory, never re-read the file */
 });
 lab.appendChild(box); lab.appendChild(txt); return lab;
}
/* A column is numeric only when every non-empty cell in it is, so one stray number in a text column
   does not jump out green and right-aligned. A leading zero means a code, not a quantity: 007 and
   0912345678 stay text, while 0.5 is still a number. */
function isNumeric(v) { return /^-?\d+(\.\d+)?$/.test(v) && !/^-?0\d/.test(v); }
function numericColumns(rows, start) {
 var ok = [], seen = [];
 for (var r = start; r < rows.length; r++) {
  for (var c = 0; c < rows[r].length; c++) {
   var v = rows[r][c].trim();
   if (!v) continue;
   seen[c] = true;
   if (ok[c] === undefined) ok[c] = true;
   if (!isNumeric(v)) ok[c] = false;
  }
 }
 return ok.map(function (f, i) { return f === true && seen[i] === true; });
}
function csvTable(rows) {
 var wrap = document.createElement("div"); wrap.className = "read";
 var tb = document.createElement("table");
 var start = 0;
 if (csvHeader) {
  var thead = document.createElement("thead"), hr = document.createElement("tr");
  rows[0].forEach(function (c) { var th = document.createElement("th"); th.textContent = c; hr.appendChild(th); });
  thead.appendChild(hr); tb.appendChild(thead); start = 1;
 }
 var nums = numericColumns(rows, start);
 var tbody = document.createElement("tbody");
 for (var r = start; r < rows.length; r++) {
  var tr = document.createElement("tr");
  rows[r].forEach(function (c, ci) {
   var td = document.createElement("td"); td.textContent = c;
   if (nums[ci]) td.className = "num";
   tr.appendChild(td); });
  tbody.appendChild(tr);
 }
 tb.appendChild(tbody); wrap.appendChild(tb); return wrap;
}

async function exists(name) {
 if (!dirHandle) return false;
 return dirHandle.getFileHandle(name).then(function () { return true; }, function () { return false; });
}
function validName(v) { return !/[\/\\]/.test(v) && v[0] !== "." && !!typeOf(v); }

async function newFile() {
 if (folderState !== "ready") return;
 var base = "untitled", n = 1, name;
 do { name = base + (n > 1 ? "-" + n : "") + ".md"; n++; }
 while (FILES.some(function (f) { return f.name === name; }) || await exists(name));
 var h, file;
 try { h = await dirHandle.getFileHandle(name, {create: true}); file = await h.getFile(); }
 catch (e) { flash(t("failed", errMsg(e))); return; }
 var f = {name: name, type: TYPES.md, ts: file.lastModified, size: 0, handle: h, body: "", eol: "\n", fresh: true};
 FILES.unshift(f); expanded = false; paintList();
 cur = f; mode = "edit"; dirty = false;
 $("stage").classList.add("open"); render();
 setTimeout(function () { var s = $("src"); if (s) s.focus(); }, 80);
 flash(t("newFile"));
}

async function save() {
 var f = cur; if (!f || !dirty || f.readonly) return;
 try {
  if (f.loose && f.handle.requestPermission) {
   var p = await f.handle.requestPermission({mode: "readwrite"});
   if (p !== "granted") { flash(t("denied")); return; } }
  var out = f.body;
  if (f.eol === "\r\n") out = out.replace(/\n/g, "\r\n");   /* put back what we normalised on read */
  if (f.bom) out = "\uFEFF" + out;
  var w = await f.handle.createWritable();
  await w.write(out); await w.close();
  var file = await f.handle.getFile();
  f.ts = file.lastModified; f.size = file.size; f.fresh = false;
  dirty = false; $("save").hidden = true;
  vibrate(8); flash(t("saved")); paintList();
 } catch (e) { flash(t("failed", errMsg(e))); }
}

/* rename: native move() first, copy+delete when the platform refuses (Android) */
async function renameFile(f, newName) {
 if (f.loose) { flash(t("loose")); return false; }
 if (!validName(newName)) { flash(t("badName")); return false; }
 var old = f.name;
 try {
  if (await exists(newName) && !window.confirm(t("overwrite", newName))) return false;
  var via = null;
  if (typeof f.handle.move === "function") {
   try { await f.handle.move(newName); via = "move()"; }
   catch (e) { console.warn("move() refused, falling back to copy+delete:", e); }
  }
  if (!via) {
   var nh = await dirHandle.getFileHandle(newName, {create: true});
   /* case-insensitive filesystems hand back the very same file for "a.md" → "A.md";
      deleting "a.md" afterwards would delete the only copy */
   if (await nh.isSameEntry(f.handle)) { flash(t("sameFile")); return false; }
   var text = await (await f.handle.getFile()).text();
   var w = await nh.createWritable(); await w.write(text); await w.close();
   await dirHandle.removeEntry(old);
   f.handle = nh; via = "copy+delete";
  }
  var file = await f.handle.getFile();
  f.name = newName; f.type = typeOf(newName); f.ts = file.lastModified; f.size = file.size;
  delete archived[old]; saveStowed();
  FILES = FILES.filter(function (x) { return x === f || x.name !== newName; });
  if (LOCAL) console.info("renamed via " + via);
  return true;
 } catch (e) { flash(t("failed", errMsg(e))); return false; }
}

function bindRename() { $("fname").addEventListener("click", startRename); }
function startRename() {
 var f = cur; if (!f) return;
 if (f.loose) { flash(t("loose")); return; }
 var old = f.name;
 var inp = document.createElement("input");
 inp.className = "fname"; inp.id = "fname"; inp.value = old; inp.spellcheck = false;
 $("fname").replaceWith(inp); inp.focus();
 var dot = old.lastIndexOf(".");
 try { inp.setSelectionRange(0, dot < 0 ? old.length : dot); } catch (e) {}
 var done = false;
 function fin(commit) {
  if (done) return; done = true;
  var v = inp.value.trim();
  var b = document.createElement("button"); b.className = "fname"; b.id = "fname";
  b.title = t("rename"); b.textContent = f.name;
  inp.replaceWith(b); b.addEventListener("click", startRename);
  if (commit && v && v !== old) {
   renameFile(f, v).then(function (ok) {
    if (ok) { flash(t("renamed", v)); if (cur === f) render(); }
    paintList(); });
  }
 }
 inp.addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); fin(true); }
  else if (e.key === "Escape") fin(false); });
 inp.addEventListener("blur", function () { fin(true); });
}

/* js: notes — memory only */
var notes = [], nid = 1;
var LAMPS = ["#4FD5D2", "#E8A83D", "#E2705C", "#9E86D8", "#7FC96B"];
function mix(h, p) { return "color-mix(in srgb," + h + " " + p + ",transparent)"; }

function addNote(x) {
 notes.unshift({id: nid, lamp: LAMPS[(nid - 1) % LAMPS.length], text: x || ""}); nid++;
 paintNotes();
 var f = $("noteList").querySelector("textarea"); if (f) f.focus();
}

function paintNotes() {
 var h = $("noteList"); h.textContent = "";
 if (!notes.length) { h.appendChild(emptyPane("")).textContent = t("empty"); }
 notes.forEach(function (n) { h.appendChild(noteEl(n)); });
 $("dot").hidden = !notes.length;
}

function noteEl(n) {
 var el = document.createElement("div"); el.className = "note";
 el.style.setProperty("--lamp", n.lamp);
 el.style.background = mix(n.lamp, "calc(var(--tint-bg)*100%)");
 el.style.borderColor = mix(n.lamp, "calc(var(--tint-line)*100%)");
 el.style.boxShadow = "0 0 22px " + mix(n.lamp, "calc(var(--glow)*42%)") + ",var(--shadow)";

 var ta = document.createElement("textarea");
 ta.value = n.text; ta.spellcheck = false; ta.rows = 1; ta.placeholder = t("ph");
 var foot = document.createElement("div"); foot.className = "foot";
 var meta = document.createElement("small");
 var bC = document.createElement("button"); bC.textContent = t("copy");
 var bT = document.createElement("button"); bT.textContent = t("toss"); bT.className = "lamp";
 var tl = document.createElement("div"); tl.className = "toss l"; tl.textContent = t("tossLbl");
 var tr = document.createElement("div"); tr.className = "toss r"; tr.textContent = t("tossLbl");
 function meter() { meta.textContent = n.text.length ? t("ch", n.text.length) : ""; }
 meter();
 function grow() { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
 ta.addEventListener("input", function () { n.text = ta.value; meter(); grow(); });
 bC.addEventListener("click", function () { cp(n.text); flash(t("copied")); });
 bT.addEventListener("click", function () { cp(n.text); toss(el, n); flash(t("copiedToss")); });
 foot.appendChild(meta); foot.appendChild(bC); foot.appendChild(bT);
 el.appendChild(ta); el.appendChild(foot); el.appendChild(tl); el.appendChild(tr);
 setTimeout(grow, 0);

 var x0 = 0, y0 = 0, dx = 0, drag = false, lock = null;
 el.addEventListener("pointerdown", function (e) {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON") return;
  drag = true; lock = null; x0 = e.clientX; y0 = e.clientY; dx = 0; el.style.transition = "none"; });
 el.addEventListener("pointermove", function (e) {
  if (!drag) return;
  var ax = e.clientX - x0, ay = e.clientY - y0;
  if (lock === null && (Math.abs(ax) > 7 || Math.abs(ay) > 7)) lock = Math.abs(ax) > Math.abs(ay) ? "x" : "y";
  if (lock !== "x") return;
  dx = ax; el.style.transform = "translateX(" + dx + "px)";
  var pr = Math.min(1, Math.abs(dx) / 95);
  el.style.opacity = String(1 - pr * .4);
  tl.style.opacity = dx > 0 ? String(pr) : "0";
  tr.style.opacity = dx < 0 ? String(pr) : "0"; });
 function end() {
  if (!drag) return; drag = false;
  el.style.transition = "transform .2s cubic-bezier(.32,.72,0,1),opacity .2s";
  if (Math.abs(dx) > 95) toss(el, n, dx > 0 ? 1 : -1);
  else { el.style.transform = ""; el.style.opacity = ""; tl.style.opacity = "0"; tr.style.opacity = "0"; } }
 el.addEventListener("pointerup", end);
 el.addEventListener("pointercancel", end);
 el.addEventListener("pointerleave", end);
 return el;
}

function toss(el, n, dir) {
 el.classList.add("gone");
 el.style.transform = "translateX(" + ((dir || -1) * 115) + "%)";
 vibrate(12);
 setTimeout(function () { notes = notes.filter(function (x) { return x.id !== n.id; }); paintNotes(); }, 185);
}

function cp(x) { if (navigator.clipboard) navigator.clipboard.writeText(x).catch(function () {}); }

/* js: tabs */
function showTab(k) {
 ["files", "notes"].forEach(function (n) { $("tab-" + n).setAttribute("aria-selected", String(n === k)); });
 $("v-files").classList.toggle("on", k === "files");
 $("v-notes").classList.toggle("on", k === "notes");
}

/* js: toast — one permanent role="status" element, so every message is announced */
var toastTimer = null;
function flash(m) {
 var el = $("toast");
 el.textContent = "";
 el.textContent = m;
 clearTimeout(toastTimer);
 toastTimer = setTimeout(function () { el.textContent = ""; }, 1700);
}

/* js: share target — files land in the folder, text becomes a note */
var SHARE_CACHE = "kaburi-share";
var intake = null;   /* {count, names} while shared files wait for a folder */

function safeName(raw) {
 var base = String(raw || "").split(/[\\/]/).pop()
  .replace(/[\u0000-\u001f<>:"|?*]/g, "").trim().slice(0, 120);
 if (!base || base === "." || base === "..") return null;
 if (!/\.[a-z0-9]+$/i.test(base)) return base + ".md";
 return typeOf(base) ? base : base + ".md";
}
function stampName() {
 var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
 return "shared-" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + ".md";
}
async function uniqueName(name) {
 var dot = name.lastIndexOf("."), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
 var cand = name, n = 2;
 while (await exists(cand)) cand = stem + "-" + (n++) + ext;
 return cand;
}
async function readShareMeta() {
 try {
  var c = await caches.open(SHARE_CACHE);
  var r = await c.match("/__share/meta");
  return r ? await r.json() : null;
 } catch (e) { return null; }
}
async function clearShare() { try { await caches.delete(SHARE_CACHE); } catch (e) {} }
/* A real share opens the installed app window (standalone / overlay / fullscreen). A cross-site form POST
   to /share lands in a plain browser tab instead, so in a tab the files always wait for a tap. */
function launchedAsApp() {
 if (LOCAL && window.__kaburiDisplayMode) return window.__kaburiDisplayMode !== "browser";
 return !window.matchMedia("(display-mode: browser)").matches;
}

function paintIntake() {
 var bar = $("intake");
 bar.hidden = !intake;
 if (!intake) return;
 var names = $("intakeNames"); names.textContent = "";
 var head = document.createElement("span");
 var line = document.createElement("b");
 if (!intake.count) {                                  /* text only: no folder, no permission */
  head.textContent = t("intakeText");
  line.textContent = intake.text.slice(0, 90);
  names.appendChild(head); names.appendChild(line);
  $("intakeBtn").textContent = t("intakeNote");
  return;
 }
 head.textContent = intake.count === 1 ? t("intakeOne") : t("intakeN", intake.count);
 names.appendChild(head);
 intake.names.slice(0, 4).forEach(function (n) { var b = document.createElement("b"); b.textContent = n; names.appendChild(b); });
 $("intakeBtn").textContent = dirHandle ? t("intakeTo", dirHandle.name || "/") : t("intakePick");
}

async function intakeShare(meta) {
 var count = meta.count > 0 ? meta.count : 0, text = meta.text || "", names = [];
 if (!count && !text) { await clearShare(); return; }
 try {
  var c = await caches.open(SHARE_CACHE);
  for (var i = 0; i < count; i++) {
   var r = await c.match("/__share/file-" + i), raw = "";
   if (r) { try { raw = decodeURIComponent(r.headers.get("x-kaburi-name") || ""); } catch (e) { raw = ""; } }
   names.push(safeName(raw) || stampName());
  }
 } catch (e) { console.warn("share intake failed:", e); }
 intake = {count: count, names: names, text: text};
 /* A real share opens the installed app window. Anything that surfaces in a plain browser tab may be a
    cross-site form POST, so it waits on the strip for a tap — files and text alike. */
 if (launchedAsApp() && (!count || folderState === "ready")) { await landFiles(); }
 else { paintIntake(); }
}

async function landFiles() {
 if (!intake) return;
 var pending = intake; intake = null; paintIntake();
 if (pending.text) { addNote(pending.text); if (!pending.count) showTab("notes"); }
 if (!pending.count) { await clearShare(); return; }
 var landed = [], firstErr = null;
 try {
  var c = await caches.open(SHARE_CACHE);
  for (var i = 0; i < pending.count; i++) {
   var r = await c.match("/__share/file-" + i);
   if (!r) continue;
   try {   /* one bad name must not stop the rest of the batch */
    var name = await uniqueName(pending.names[i]);
    var h = await dirHandle.getFileHandle(name, {create: true});
    var w = await h.createWritable(); await w.write(await r.blob()); await w.close();
    landed.push(name);
   } catch (e) { if (!firstErr) firstErr = e; console.warn("share intake failed for", pending.names[i], e); }
  }
  await scan();
  if (firstErr) flash(t("failed", errMsg(firstErr)));
  else if (landed.length === 1) flash(t("landed", landed[0]));
  else if (landed.length) flash(t("landedN", landed.length));
 } catch (e) {
  console.warn("share intake failed:", e);
  flash(t("failed", errMsg(e)));
 } finally {
  await clearShare();
 }
}

function intakeAction() {
 if (intake && !intake.count) return landFiles();     /* text only: nothing to authorize */
 if (!dirHandle) return pickFolder();
 if (folderState === "needauth") return reauth();
 return landFiles();
}

async function handleShare() {
 var token = new URLSearchParams(location.search).get("share-target");
 var meta = await readShareMeta();
 if (token) history.replaceState(null, "", "/");
 /* The token is minted by the worker per payload and travels in the redirect it answers with. A payload
    whose token does not match this launch was parked by someone else's POST, or abandoned; either way it
    is dropped here rather than left armed for a later launch to pick up. */
 if (token && meta && meta.nonce && meta.nonce === token) { await intakeShare(meta); return; }
 if (meta) await clearShare();
}

/* js: file handler — "Open with" from the OS files app */
function bindLaunchQueue() {
 if (!("launchQueue" in window)) return;
 window.launchQueue.setConsumer(async function (params) {
  if (!params.files || !params.files.length) return;
  var h = params.files[0];
  var match = null;
  if (dirHandle) {
   for (var i = 0; i < FILES.length; i++) {
    var f = FILES[i];
    if (f.name === h.name) {
     try { if (await f.handle.isSameEntry(h)) { match = f; break; } } catch (e) {} } }
  }
  if (match) return openFile(match);
  var file;
  try { file = await h.getFile(); } catch (e) { flash(t("failed", errMsg(e))); return; }
  openFile({name: h.name, type: typeOf(h.name) || TYPES.txt, ts: file.lastModified, size: file.size, handle: h, loose: true});
 });
}

/* js: boot — the only place anything runs */
function boot() {
 applyLayout();
 setTheme(PREF.get("theme", "dark") === "light" ? "light" : "dark", false);
 bindRename();
 applyLang();

 $("langBtn").addEventListener("click", function () { lang = lang === "en" ? "zh" : "en"; PREF.set("lang", lang); applyLang(); });
 $("themeBtn").addEventListener("click", function () {
  setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true); });
 $("fsBtn").hidden = !document.fullscreenEnabled;
 $("fsBtn").addEventListener("click", toggleFullscreen);
 document.addEventListener("fullscreenchange", applyLayout);
 if (fsQuery.addEventListener) fsQuery.addEventListener("change", applyLayout);
 window.addEventListener("resize", applyLayout);

 $("wd").addEventListener("click", pickFolder);
 $("addFile").addEventListener("click", newFile);
 $("scope").addEventListener("click", function () { expanded = !expanded; paintList(); });
 $("vtog").addEventListener("click", function () {
  mode = mode === "view" ? "edit" : "view"; render();
  if (mode === "edit") setTimeout(function () { var s = $("src"); if (s) s.focus(); }, 70); });
 $("back").addEventListener("click", closeStage);
 $("totop").addEventListener("pointerdown", function (e) { e.preventDefault(); });  /* keep the keyboard up */
 $("totop").addEventListener("click", toTop);
 $("intakeBtn").addEventListener("click", intakeAction);
 $("save").addEventListener("click", save);
 $("add").addEventListener("click", function () { addNote(""); });
 ["files", "notes"].forEach(function (k) { $("tab-" + k).addEventListener("click", function () { showTab(k); }); });

 document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (!$("save").hidden) save(); } });
 document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") rescanSoon(); });
 window.addEventListener("focus", rescanSoon);

 if ("serviceWorker" in navigator && (location.protocol === "https:" || LOCAL) && !window.__noSW) {
  navigator.serviceWorker.register("/sw.js").catch(function () {}); }

 paintStatus(); paintList();
 var ready = HAS_FS ? restoreDir() : Promise.resolve();
 ready.then(function () { paintStatus(); paintList(); bindLaunchQueue(); return handleShare(); });

 /* test hook, localhost only: drive the app with an OPFS directory handle */
 if (LOCAL) window.__kaburi = {useDir: useDir, scan: scan, intake: function () { return intake; }, markDirty: function () { dirty = true; }, files: function () { return FILES; }, state: function () { return folderState; },
  cur: function () { return cur; }, save: save, rename: renameFile, notes: function () { return notes; }};
}
boot();
})();
