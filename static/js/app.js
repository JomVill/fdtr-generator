/* ============================================================
   FDTR Generator — Client-side JavaScript
   ============================================================ */

"use strict";

/* ── Dynamic Holiday / Leave / Travel rows ─────────────────── */

/**
 * addRow(type)
 *   type: "holidays" | "leave" | "travel"
 *
 * Clones the hidden <template> and appends it to the container.
 */
function addRow(type) {
  var templateMap = {
    holidays: "holiday-row-template",
    leave:    "leave-row-template",
    travel:   "travel-row-template",
    related:  "related-row-template",
  };
  var containerMap = {
    holidays: "holidays-container",
    leave:    "leave-container",
    travel:   "travel-container",
    related:  "related-container",
  };

  var tmplEl    = document.getElementById(templateMap[type]);
  var container = document.getElementById(containerMap[type]);
  if (!tmplEl || !container) return;

  var clone = tmplEl.content.cloneNode(true);

  // Pre-fill date inputs with today
  var today = new Date().toISOString().slice(0, 10);
  clone.querySelectorAll("input[type='date']").forEach(function (el) {
    el.value = today;
  });

  container.appendChild(clone);
}

/**
 * removeRow(btn)
 *   Removes the closest .dynamic-row ancestor of the clicked button.
 */
function removeRow(btn) {
  var row = btn.closest(".dynamic-row");
  if (row) row.remove();
}

/* ── Weekly Schedule Slot management (Setup page) ─────────── */

/**
 * addSlot(day)
 *   day: e.g. "monday", "tuesday", …
 *
 * Clones the hidden #slot-template. The template uses "DAY" as a
 * placeholder in all name attributes — we replace it with the real
 * day string before appending.
 */
function addSlot(day) {
  var tmpl      = document.getElementById("slot-template");
  var container = document.getElementById("slots-" + day);
  if (!tmpl || !container) return;

  var clone = tmpl.content.cloneNode(true);

  // Replace the "DAY" placeholder in every name attribute
  clone.querySelectorAll("[name]").forEach(function (el) {
    el.name = el.name.replace("DAY", day);
  });

  // Remove empty-state hint if present
  var hint = container.querySelector(".schedule-empty");
  if (hint) hint.remove();

  container.appendChild(clone);
}

/**
 * removeSlot(btn)
 *   Removes the slot row; restores the empty hint if no slots remain.
 */
function removeSlot(btn) {
  var row = btn.closest(".slot-row");
  if (!row) return;

  // Find the parent slots-container to check emptiness after removal
  var container = row.closest(".slots-container");
  row.remove();

  if (container && container.querySelectorAll(".slot-row").length === 0) {
    var hint       = document.createElement("p");
    hint.className = "schedule-empty";
    hint.textContent = 'No slots — click "+ Add Slot" below.';
    container.appendChild(hint);
  }
}

/* ── Generate-page: spinner on submit ─────────────────────── */

(function () {
  var form    = document.getElementById("generate-form");
  var overlay = document.getElementById("loading-overlay");
  var genBtn  = document.getElementById("generate-btn");

  if (!form || !overlay) return;

  form.addEventListener("submit", function () {
    overlay.classList.add("active");
    if (genBtn) {
      genBtn.disabled    = true;
      genBtn.textContent = "Generating…";
    }
    // Safety timeout — hide overlay after 30 s so the page isn't frozen
    setTimeout(function () {
      overlay.classList.remove("active");
      if (genBtn) {
        genBtn.disabled    = false;
        genBtn.textContent = "⬇ Generate & Download FDTR";
      }
    }, 30000);
  });
})();
