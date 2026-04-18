/* ============================================================
   FDTR Generator — Preview renderer (static build)
   Replaces the Jinja {% for %} loops in templates/preview.html.
   Reads sessionStorage.fdtr_preview_payload  → { payload, preview }
   Renders the FDTR table and wires the Download button.
   ============================================================ */

(function () {
  "use strict";

  var LS_PREVIEW = "fdtr_preview_payload";
  var CATS = ["class", "consultation", "related_activities", "others"];

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderBody(preview) {
    var rows = preview.days || [];
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.type === "special") {
        var totalDisplay = "";
        if (row.total === 0) totalDisplay = "0";
        else if (row.total != null && row.total !== "") totalDisplay = String(row.total);

        html +=
          '<tr class="day-row day-' + escHtml(row.day_class) + '">' +
            '<td class="td-day">' + escHtml(row.day) + '</td>' +
            '<td colspan="12" class="td-special-label">' + escHtml(row.label) + '</td>' +
            '<td class="td-total">' + totalDisplay + '</td>' +
          '</tr>';
      } else {
        // Regular / related_activities: 2 sub-rows
        var subrow = function (subIdx) {
          var out = "";
          for (var c = 0; c < CATS.length; c++) {
            var entries = row.cat_data[CATS[c]] || [];
            var e = entries[subIdx] || null;
            var tIn  = e ? e.in  : "";
            var tOut = e ? e.out : "";
            var hrs  = e ? (e.hrs === "" ? "" : e.hrs) : "";
            out +=
              '<td class="td-time">' + escHtml(tIn)  + '</td>' +
              '<td class="td-time">' + escHtml(tOut) + '</td>' +
              '<td class="td-hrs">'  + escHtml(hrs)  + '</td>';
          }
          return out;
        };
        var totalStr = (row.total === "" || row.total == null) ? "" : String(row.total);

        html +=
          '<tr class="day-row day-' + escHtml(row.day_class) + '">' +
            '<td class="td-day" rowspan="2">' + escHtml(row.day) + '</td>' +
            subrow(0) +
            '<td class="td-total" rowspan="2">' + escHtml(totalStr) + '</td>' +
          '</tr>' +
          '<tr class="day-row day-' + escHtml(row.day_class) + ' day-subrow">' +
            subrow(1) +
          '</tr>';
      }
    }
    return html;
  }

  function renderTable(preview) {
    var monthLabel = (preview.month_name || "") + " " + (preview.year || "");

    // Subtitle + title update
    var titleEl = document.getElementById("preview-title-sub");
    if (titleEl) {
      titleEl.textContent = monthLabel + " \u2014 " + (preview.faculty_name || "");
    }
    var docTitle = document.getElementById("preview-doc-title");
    if (docTitle) {
      document.title = "Preview \u2014 " + monthLabel;
    }

    // Month line in table
    var monthSpanEl = document.getElementById("preview-month-line");
    if (monthSpanEl) monthSpanEl.textContent = "For the month of " + monthLabel;

    // Name + Department cells
    var nameCell = document.getElementById("preview-name-cell");
    if (nameCell) nameCell.textContent = "NAME: " + (preview.faculty_name || "");
    var deptCell = document.getElementById("preview-dept-cell");
    if (deptCell) deptCell.textContent = "DEPARTMENT: " + (preview.department || "");

    // Body rows
    var tbody = document.getElementById("preview-tbody");
    if (tbody) tbody.innerHTML = renderBody(preview);

    // Footer
    var certTextEl = document.getElementById("preview-cert-text");
    if (certTextEl) {
      certTextEl.textContent =
        "This certifies upon my honor that the foregoing is a record for services I rendered " +
        "to MSU-Iligan Institute of Technology during the month of " + monthLabel + ".";
    }
    var footerName = document.getElementById("preview-footer-name");
    if (footerName) footerName.textContent = preview.faculty_name || "";
    var footerDesig = document.getElementById("preview-footer-desig");
    if (footerDesig) footerDesig.textContent = preview.designation || "";
    var footerHead = document.getElementById("preview-footer-head");
    if (footerHead) footerHead.textContent = preview.dept_head || "";
  }

  function wireDownloadButton(payload, specialDays) {
    var btns = document.querySelectorAll(".btn-download-fdtr");
    if (!btns.length) return;
    btns.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.classList.add("active");
        btn.disabled = true;

        try {
          var p = window.generateFdtr(payload, specialDays);
          (p && typeof p.then === "function" ? p : Promise.resolve())
            .then(function () {
              if (overlay) overlay.classList.remove("active");
              btn.disabled = false;
            }, function (err) {
              console.error(err);
              if (overlay) overlay.classList.remove("active");
              btn.disabled = false;
              alert("Download failed: " + (err && err.message ? err.message : err));
            });
        } catch (err) {
          console.error(err);
          if (overlay) overlay.classList.remove("active");
          btn.disabled = false;
          alert("Download failed: " + (err && err.message ? err.message : err));
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var raw = sessionStorage.getItem(LS_PREVIEW);
    if (!raw) {
      // Bounce back to generate page — user landed here directly
      location.replace("generate.html");
      return;
    }
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || !parsed.preview || !parsed.payload) {
      location.replace("generate.html");
      return;
    }

    renderTable(parsed.preview);

    // Rebuild specialDays from the stored payload (fresh, in case month changed)
    var specialDays = window.buildSpecialDays(parsed.payload);
    wireDownloadButton(parsed.payload, specialDays);
  });
})();
