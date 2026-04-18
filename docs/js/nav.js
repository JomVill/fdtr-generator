/* ============================================================
   FDTR Generator — Nav active-state (static build)
   Replaces Flask's {% if request.endpoint == ... %} block.
   Include on every page AFTER the <nav class="navbar"> markup.
   ============================================================ */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var path = (location.pathname.split("/").pop() || "setup.html").toLowerCase();
    // Treat root and index.html as setup.html (index redirects there)
    if (path === "" || path === "index.html") path = "setup.html";

    // Match Flask grouping: preview.html still highlights "Generate"
    var matches = {
      "setup.html":    "setup",
      "generate.html": "generate",
      "preview.html":  "generate",
    };
    var active = matches[path];
    if (!active) return;

    document.querySelectorAll(".nav-link").forEach(function (a) {
      if (a.dataset.page === active) a.classList.add("active");
    });
  });
})();
