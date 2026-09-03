/* Renders the app icons with Chromium. Run: NODE_PATH=$(npm root -g) node scripts/icons.cjs */
const path = require("path");
const { chromium } = require("playwright");

function page(size, pad) {
  const g = Math.round(size * 0.56);
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#0A0F12}
  .b{width:${size}px;height:${size}px;display:grid;place-items:center;position:relative;overflow:hidden;background:#0A0F12}
  .u{font:500 ${g}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#4FD5D2;position:relative;transform:translateY(-${Math.round(size*0.02)}px);
     text-shadow:0 0 ${size*0.04}px rgba(79,213,210,.85),0 0 ${size*0.10}px rgba(79,213,210,.5)}
  .h{position:absolute;left:50%;top:50%;width:${size*0.9}px;height:${size*0.9}px;transform:translate(-50%,-50%);border-radius:50%;
     background:radial-gradient(circle,rgba(79,213,210,.30) 0%,rgba(79,213,210,0) 62%)}
  .cut{position:absolute;left:${pad?size*0.18:size*0.07}px;top:${size*0.28}px;bottom:${size*0.28}px;width:${Math.max(4,size*0.03)}px;border-radius:0 ${size*0.01}px ${size*0.01}px 0;
     background:#CF5A56;box-shadow:0 0 ${size*0.03}px rgba(207,90,86,.6)}
  </style><div class="b"><div class="h"></div><div class="cut"></div><div class="u">U</div></div>`;
}

(async () => {
  const browser = await chromium.launch();
  const out = path.join(__dirname, "..", "public");
  for (const [name, size, pad] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true]]) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(page(size, pad));
    await p.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
    console.log("wrote", name);
  }
  await browser.close();
})();
