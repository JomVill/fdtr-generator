/* ============================================================
   FDTR Generator — Client-side JS v2
   localStorage persistence · Dynamic rows · Spinner
   ============================================================ */

"use strict";

/* ── localStorage keys ────────────────────────────────────── */
var LS_PROFILE    = 'fdtr_profile';
var LS_SCHEDULE   = 'fdtr_schedule';
var LS_LAST_MONTH = 'fdtr_last_month';
var LS_LAST_YEAR  = 'fdtr_last_year';

/* ── Storage helpers ──────────────────────────────────────── */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch(e) {}
}
function lsGetJSON(key) {
  var raw = lsGet(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

/* ── Dynamic rows (generate page) ────────────────────────── */
function addRow(type) {
  var templateMap = {
    holidays: 'holiday-row-template',
    leave:    'leave-row-template',
    travel:   'travel-row-template',
    related:  'related-row-template',
  };
  var containerMap = {
    holidays: 'holidays-container',
    leave:    'leave-container',
    travel:   'travel-container',
    related:  'related-container',
  };

  var tmpl      = document.getElementById(templateMap[type]);
  var container = document.getElementById(containerMap[type]);
  if (!tmpl || !container) return;

  var clone = tmpl.content.cloneNode(true);

  var today = new Date().toISOString().slice(0, 10);
  clone.querySelectorAll("input[type='date']").forEach(function(el) {
    el.value = today;
  });

  container.appendChild(clone);
}

function removeRow(btn) {
  var row = btn.closest('.dynamic-row');
  if (row) row.remove();
}

/* ── Profile persistence (setup page) ────────────────────── */
function saveProfile() {
  var p = {};
  ['faculty_name','designation','department','dept_head'].forEach(function(f) {
    var el = document.getElementById(f);
    p[f] = el ? el.value : '';
  });
  lsSet(LS_PROFILE, JSON.stringify(p));
}

function restoreProfile() {
  var p = lsGetJSON(LS_PROFILE);
  if (!p) return;
  ['faculty_name','designation','department','dept_head'].forEach(function(f) {
    var el = document.getElementById(f);
    if (el && p[f] && !el.value) el.value = p[f];
  });
}

/* ── Generate page: hidden faculty/schedule fields ────────── */
function populateHiddenFields() {
  var p = lsGetJSON(LS_PROFILE);
  if (p) {
    ['faculty_name','designation','department','dept_head'].forEach(function(f) {
      var el = document.getElementById('hf-' + f);
      if (el && p[f]) el.value = p[f];
    });
  }
  var sched = lsGet(LS_SCHEDULE);
  var el = document.getElementById('hf-schedule');
  if (el && sched) el.value = sched;
}

/* ── Month / Year persistence (generate page) ────────────── */
function saveMonthYear() {
  var m = document.getElementById('month');
  var y = document.getElementById('year');
  if (m) lsSet(LS_LAST_MONTH, m.value);
  if (y) lsSet(LS_LAST_YEAR,  y.value);
}

function restoreMonthYear() {
  var m  = document.getElementById('month');
  var y  = document.getElementById('year');
  var lm = lsGet(LS_LAST_MONTH);
  var ly = lsGet(LS_LAST_YEAR);
  if (m && lm) m.value = lm;
  if (y && ly) y.value = ly;
}

/* ── Setup page init ──────────────────────────────────────── */
function initSetupPage() {
  restoreProfile();

  // Auto-save profile on every keystroke
  ['faculty_name','designation','department','dept_head'].forEach(function(f) {
    var el = document.getElementById(f);
    if (el) el.addEventListener('input', saveProfile);
  });

  // Build calendar widget
  var calContainer = document.getElementById('cal-container');
  if (calContainer && window.calendarWidget) {
    var initData = null;

    // 1. Try server-rendered initial data (if session has schedule)
    var serverEl = document.getElementById('schedule-initial');
    if (serverEl) {
      try { initData = JSON.parse(serverEl.textContent); } catch(e) {}
    }

    // 2. Fall back to localStorage
    if (!initData) {
      initData = lsGetJSON(LS_SCHEDULE);
    }

    calendarWidget.build(calContainer, initData);
  }

  // On form submit: ensure profile is saved
  var form = document.getElementById('setup-form');
  if (form) {
    form.addEventListener('submit', function() {
      saveProfile();
    });
  }
}

/* ── Generate page init ───────────────────────────────────── */
function initGeneratePage() {
  restoreMonthYear();
  populateHiddenFields();

  var m = document.getElementById('month');
  var y = document.getElementById('year');
  if (m) m.addEventListener('change', saveMonthYear);
  if (y) y.addEventListener('change', saveMonthYear);
}

/* ── Generate-page: spinner on preview submit ─────────────── */
(function() {
  var form    = document.getElementById('generate-form');
  var overlay = document.getElementById('loading-overlay');
  var btn     = document.getElementById('generate-btn');

  if (!form || !overlay) return;

  form.addEventListener('submit', function() {
    // Re-populate hidden fields right before submit (in case LS changed)
    populateHiddenFields();

    overlay.classList.add('active');
    if (btn) { btn.disabled = true; btn.textContent = 'Building preview\u2026'; }

    setTimeout(function() {
      overlay.classList.remove('active');
      if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDC41 Preview FDTR'; }
    }, 30000);
  });
})();

/* ── Page dispatcher ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('setup-form'))    initSetupPage();
  if (document.getElementById('generate-form')) initGeneratePage();
});
