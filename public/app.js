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
  saved: "Saved", renamed: "Renamed → %s", copied: "Copied", copiedToss: "Copied, note tossed",
  today: "Today", yday: "Yesterday", other: "中",
  noFolder: "no folder", changeFolder: "Tap to change folder",
  pickFolder: "Choose a folder",
  pickHint: "Kaburi works on one folder. Pick where your md / html / txt files live.",
  reauth: "Re-authorize", reauthHint: "Folder access needs one tap after reopening.",
  unsupported: "This browser can't open local folders. Use Chrome 132+ or Edge on desktop, ChromeOS or Android.",
  overwrite: "\u201C%s\u201D already exists. Overwrite it?",
  badName: "Keep it .md, .html or .txt — no slashes.",
  failed: "Failed: %s", denied: "Folder access was not granted.",
  loose: "Opened from outside the folder — rename is off.",
  fullscreen: "Fullscreen"},
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
  saved: "已存回", renamed: "改名 → %s", copied: "已複製", copiedToss: "已複製，便條丟了",
  today: "今天", yday: "昨天", other: "EN",
  noFolder: "沒有資料夾", changeFolder: "點一下換資料夾",
  pickFolder: "選一個資料夾",
  pickHint: "Kaburi 只處理一個資料夾。選你放 md / html / txt 的地方。",
  reauth: "重新授權", reauthHint: "重開之後要按一下才能再碰資料夾。",
  unsupported: "這個瀏覽器不能開本機資料夾。請用桌機、ChromeOS 或 Android 上的 Chrome 132+ 或 Edge。",
  overwrite: "「%s」已經存在，覆蓋掉它？",
  badName: "只能是 .md、.html、.txt，不能有斜線。",
  failed: "失敗：%s", denied: "沒有拿到資料夾的權限。",
  loose: "從資料夾外開的檔案，不能改名。",
  fullscreen: "全螢幕"}
};
var PREF = {
 get: function (k, d) { try { var v = localStorage.getItem("kaburi." + k); return v === null ? d : v; } catch (e) { return d; } },
 set: function (k, v) { try { localStorage.setItem("kaburi." + k, v); } catch (e) {} }
};
var lang = PREF.get("lang", "en");
if (lang !== "zh") lang = "en";
function t(k, v) {
 var s = STR[lang][k] || k;
 if (v !== undefined) s = s.replace("%n", v).replace("%s", v);
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
var folderState = HAS_FS ? "none" : "unsupported";   /* none | needauth | ready | unsupported */
var EXT = {md: "md", markdown: "md", txt: "txt", html: "html", htm: "html"};
function kindOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? (EXT[m[1].toLowerCase()] || null) : null; }
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
   var k = kindOf(entry.name); if (!k) continue;
   var file;
   try { file = await entry.getFile(); } catch (e) { continue; }
   if (cur && !cur.loose && cur.name === entry.name) {
    cur.handle = entry; cur.kind = k; cur.ts = file.lastModified; cur.size = file.size;
    out.push(cur);
   } else {
    out.push({name: entry.name, kind: k, ts: file.lastModified, size: file.size, handle: entry});
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
  if (p === "granted") { folderState = "ready"; await scan(); }
  else flash(t("denied"));
 } catch (e) { flash(t("failed", errMsg(e))); }
}
async function restoreDir() {
 var h = await idbGet("dir");
 if (!h) return;
 dirHandle = h;
 try {
  var p = await h.queryPermission({mode: "readwrite"});
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
 wd.textContent = dirHandle ? (dirHandle.name || "/") : t("noFolder");
 wd.title = t("changeFolder");
 wd.classList.toggle("none", !dirHandle);
 wd.disabled = !HAS_FS;
 $("addFile").hidden = folderState !== "ready";
}

function rowFor(f, withDate) {
 var b = document.createElement("button"); b.className = "slice";
 b.innerHTML = '<span class="cut ' + f.kind + '"></span><span class="t"><b></b><small></small></span>' +
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
 var on = isStowed(f);
 if (on) delete archived[f.name]; else archived[f.name] = f.ts;
 saveStowed();
 vibrate(10);
 flash(t(on ? "unstowed" : "stowed"));
 paintList();
}

function emptyPane(html) {
 var e = document.createElement("div"); e.className = "emptypane"; e.innerHTML = html; return e;
}
function paintList() {
 var h = $("rows"); h.textContent = "";
 var scope = $("scope");
 if (folderState !== "ready") {
  scope.hidden = true;
  if (folderState === "unsupported") { h.appendChild(emptyPane("")).textContent = t("unsupported"); return; }
  if (folderState === "needauth") {
   var e = emptyPane("<b></b><span></span><br><button class=\"btn\" id=\"reauth\"></button>");
   e.querySelector("b").textContent = dirHandle ? dirHandle.name : "";
   e.querySelector("span").textContent = t("reauthHint");
   e.querySelector("button").textContent = t("reauth");
   e.querySelector("button").addEventListener("click", reauth);
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
  try { f.body = await (await f.handle.getFile()).text(); }
  catch (e) { flash(t("failed", errMsg(e))); return; }
 }
 cur = f; mode = f.kind === "txt" ? "edit" : "view"; dirty = false;
 showTab("files");
 $("stage").classList.add("open"); render();
 if (f.loose) flash(t("loose"));
}
function closeStage() { $("stage").classList.remove("open"); }

function render() {
 var f = cur; if (!f) return;
 var fn = $("fname");
 if (fn.tagName === "BUTTON") { fn.textContent = f.name; fn.title = f.loose ? t("loose") : t("rename"); }
 $("vtog").dataset.mode = mode;
 $("vlbl").textContent = t(mode);
 $("save").textContent = t("save");
 $("save").hidden = !(mode === "edit" && dirty);
 var body = $("sbody"); body.textContent = "";

 if (mode === "edit") {
  var ta = document.createElement("textarea"); ta.id = "src"; ta.spellcheck = false; ta.value = f.body;
  ta.addEventListener("input", function () { f.body = ta.value; if (!dirty) { dirty = true; $("save").hidden = false; } });
  body.appendChild(ta); return; }

 if (f.kind === "html") {
  var w = document.createElement("div"); w.className = "strip"; w.textContent = t("strip");
  body.appendChild(w);
  var fr = document.createElement("iframe"); fr.className = "preview";
  fr.setAttribute("sandbox", "");            /* never add allow-same-origin next to allow-scripts */
  fr.setAttribute("referrerpolicy", "no-referrer");
  fr.srcdoc = '<meta charset="utf-8"><style>body{font:18px/1.8 system-ui;padding:22px;color:#182126;background:#fff}img{max-width:100%}</style>' + f.body;
  body.appendChild(fr); return; }

 var d = document.createElement("div"); d.className = "read"; d.innerHTML = md(f.body); body.appendChild(d);
}

async function exists(name) {
 if (!dirHandle) return false;
 return dirHandle.getFileHandle(name).then(function () { return true; }, function () { return false; });
}
function validName(v) { return !/[\/\\]/.test(v) && v[0] !== "." && !!kindOf(v); }

async function newFile() {
 if (folderState !== "ready") return;
 var base = "untitled", n = 1, name;
 do { name = base + (n > 1 ? "-" + n : "") + ".md"; n++; }
 while (FILES.some(function (f) { return f.name === name; }) || await exists(name));
 var h, file;
 try { h = await dirHandle.getFileHandle(name, {create: true}); file = await h.getFile(); }
 catch (e) { flash(t("failed", errMsg(e))); return; }
 var f = {name: name, kind: "md", ts: file.lastModified, size: 0, handle: h, body: "", fresh: true};
 FILES.unshift(f); expanded = false; paintList();
 cur = f; mode = "edit"; dirty = false;
 $("stage").classList.add("open"); render();
 setTimeout(function () { var s = $("src"); if (s) s.focus(); }, 80);
 flash(t("newFile"));
}

async function save() {
 var f = cur; if (!f || !dirty) return;
 try {
  if (f.loose && f.handle.requestPermission) {
   var p = await f.handle.requestPermission({mode: "readwrite"});
   if (p !== "granted") { flash(t("denied")); return; } }
  var w = await f.handle.createWritable();
  await w.write(f.body); await w.close();
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
   var text = await (await f.handle.getFile()).text();
   var nh = await dirHandle.getFileHandle(newName, {create: true});
   var w = await nh.createWritable(); await w.write(text); await w.close();
   await dirHandle.removeEntry(old);
   f.handle = nh; via = "copy+delete";
  }
  var file = await f.handle.getFile();
  f.name = newName; f.kind = kindOf(newName); f.ts = file.lastModified; f.size = file.size;
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

/* js: toast */
var toast = null, toastTimer = null;
function flash(m) {
 if (toast) toast.remove();
 toast = document.createElement("div"); toast.className = "toast"; toast.textContent = m;
 document.body.appendChild(toast);
 clearTimeout(toastTimer);
 toastTimer = setTimeout(function () { if (toast) { toast.remove(); toast = null; } }, 1700);
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
  openFile({name: h.name, kind: kindOf(h.name) || "txt", ts: file.lastModified, size: file.size, handle: h, loose: true});
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
 ready.then(function () { paintStatus(); paintList(); bindLaunchQueue(); });

 /* test hook, localhost only: drive the app with an OPFS directory handle */
 if (LOCAL) window.__kaburi = {useDir: useDir, scan: scan, files: function () { return FILES; }, state: function () { return folderState; },
  cur: function () { return cur; }, save: save, rename: renameFile, notes: function () { return notes; }};
}
boot();
})();
