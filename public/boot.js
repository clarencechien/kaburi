/* js: boot — runs synchronously in <head> so the first paint already has the saved theme / language */
(function () {
  "use strict";
  var root = document.documentElement;

  /* Cloudflare's own hostnames are not a front door. workers.dev is switched off in wrangler.jsonc;
     this catches it (and a pages.dev alias) anyway and sends the visitor to the custom domain. */
  var CANON = "kaburi.ai-apps.work";
  var host = location.hostname;
  if (/\.(workers|pages)\.dev$/.test(host) && host !== CANON) {
    location.replace("https://" + CANON + location.pathname + location.search + location.hash);
    return;
  }

  try {
    var th = localStorage.getItem("kaburi.theme");
    if (th === "light" || th === "dark") root.setAttribute("data-theme", th);
    var lg = localStorage.getItem("kaburi.lang");
    if (lg === "zh" || lg === "en") root.setAttribute("data-lang", lg);
  } catch (e) { /* private window / policy */ }

  var fs = !!document.fullscreenElement ||
    (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches);
  root.setAttribute("data-layout", fs && window.innerWidth >= 700 ? "tablet" : "app");
})();
