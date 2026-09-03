/* js: boot — runs synchronously in <head> so the first paint already has the saved theme / language */
(function () {
  "use strict";
  var root = document.documentElement;

  /* The *.pages.dev production alias is not a real front door. Send it to the custom domain.
     Preview deployments (<hash>.<project>.pages.dev) have four labels and are left alone. */
  var CANON = "kaburi.ai-apps.work";
  var host = location.hostname;
  if (/^[^.]+\.pages\.dev$/.test(host) && host !== CANON) {
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
