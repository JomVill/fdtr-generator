/* ============================================================
   FDTR Generator — Client-side JS v3
   localStorage persistence · Dynamic rows · Named presets
   Per-month Step-2 data · Spinner
   ============================================================ */

"use strict";

/* ── localStorage keys ──────────────────────────────────────── */
var LS_PROFILE    = 'fdtr_profile';
var LS_SCHEDULE   = 'fdtr_schedule';
var LS_LAST_MONTH = 'fdtr_last_month';
var LS_LAST_YEAR  = 'fdtr_last_year';
var LS_PRESETS    = 'fdtr_schedule_presets';  // named schedule presets

/* ── Storage helpers ──────────────────────────────────────────── */
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

/* ── Dynamic rows (generate page) ──────────────────────────────── */

// Prevents addRow() from triggering a premature save while restoreGenerateForm()
// is mid-flight populating rows with saved values.
var _restoringForm = false;

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
  // Skip saving during restore — restoreGenerateForm() does one final save at the end
  if (!_restoringForm) serializeGenerateForm();
}

function removeRow(btn) {
  var row = btn.closest('.dynamic-row');
  if (row) row.remove();
  serializeGenerateForm();
}

/* ── Time toggle on Related Activities rows ─────────────────────── */
function toggleTime(btn) {
  var row   = btn.closest('.dynamic-row');
  var slots = row.querySelector('.time-slots');
  if (!slots) return;
  var isVisible = slots.style.display !== 'none';
  slots.style.display = isVisible ? 'none' : 'flex';
  btn.textContent = isVisible ? '+ Add time' : '\u2212 Remove time';
  serializeGenerateForm();
}

/* ── Profile persistence (setup page) ──────────────────────────── */
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

/* ── Named schedule presets ─────────────────────────────────────── */
function getPresets() {
  return lsGetJSON(LS_PRESETS) || {};
}

function populatePresetSelect() {
  var sel = document.getElementById('preset-select');
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">— Load saved schedule —</option>';
  var presets = getPresets();
  Object.keys(presets).sort().forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  if (current && presets[current]) sel.value = current;
}

function savePreset() {
  var name = (window.prompt ? window.prompt('Name for this schedule:') : null);
  if (!name || !name.trim()) return;
  name = name.trim();

  // Serialize current calendar state first
  if (window.calendarWidget) calendarWidget.save();
  var current = lsGet(LS_SCHEDULE);
  if (!current) { alert('No schedule to save yet.'); return; }

  var presets = getPresets();
  presets[name] = current;
  lsSet(LS_PRESETS, JSON.stringify(presets));
  populatePresetSelect();

  var sel = document.getElementById('preset-select');
  if (sel) sel.value = name;

  var btn = document.getElementById('btn-save-preset');
  if (btn) { var orig = btn.textContent; btn.textContent = '\u2713 Saved'; setTimeout(function() { btn.textContent = orig; }, 1600); }
}

function loadPreset() {
  var sel = document.getElementById('preset-select');
  if (!sel || !sel.value) return;
  var presets = getPresets();
  var raw = presets[sel.value];
  if (!raw) return;
  var parsed; try { parsed = JSON.parse(raw); } catch(e) { return; }
  if (window.calendarWidget) calendarWidget.load(parsed);
}

function deletePreset() {
  var sel = document.getElementById('preset-select');
  if (!sel || !sel.value) return;
  if (!window.confirm('Delete preset "' + sel.value + '"?')) return;
  var presets = getPresets();
  delete presets[sel.value];
  lsSet(LS_PRESETS, JSON.stringify(presets));
  populatePresetSelect();
}

/* ── Generate page: hidden faculty/schedule fields ─────────────── */
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

/* ── Month / Year persistence (generate page) ──────────────────── */
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

/* ── Per-month Step-2 form data ─────────────────────────────────── */

// Tracks which month key is currently displayed in the form.
// Critically, this is NOT updated until AFTER we've saved the old month's data,
// so serializeGenerateForm() always writes to the correct (old) key even when
// the month/year dropdowns have already changed to a new value.
var _activeMonthKey = null;

function getMonthKey() {
  var m = document.getElementById('month');
  var y = document.getElementById('year');
  return 'fdtr_gen_' + (y ? y.value : 'x') + '_' + (m ? m.value : 'x');
}

function serializeGenerateForm() {
  if (!document.getElementById('generate-form')) return;

  function getRows(containerId, fields) {
    var rows = [];
    var container = document.getElementById(containerId);
    if (!container) return rows;
    container.querySelectorAll('.dynamic-row').forEach(function(row) {
      var obj = {};
      fields.forEach(function(name) {
        var el = row.querySelector('[name="' + name + '"]');
        obj[name] = el ? el.value : '';
      });
      // For related rows: also store whether time is visible
      var ts = row.querySelector('.time-slots');
      if (ts) obj['_timeVisible'] = ts.style.display !== 'none';
      rows.push(obj);
    });
    return rows;
  }

  var data = {
    holidays: getRows('holidays-container', ['holiday_date[]','holiday_label[]']),
    leave:    getRows('leave-container',    ['leave_date[]','leave_type[]']),
    travel:   getRows('travel-container',   ['travel_start[]','travel_end[]','travel_ta[]']),
    related:  getRows('related-container',  ['related_start[]','related_end[]','related_time_in[]','related_time_out[]']),
  };
  // Use _activeMonthKey if set — it stays pinned to the OLD month even after
  // the dropdown has already switched, preventing cross-month data leakage.
  var key = _activeMonthKey || getMonthKey();
  lsSet(key, JSON.stringify(data));
}

function restoreGenerateForm() {
  if (!document.getElementById('generate-form')) return;

  // Advance _activeMonthKey to the month now shown in the dropdowns
  _activeMonthKey = getMonthKey();

  var raw = lsGet(_activeMonthKey);

  // Always clear all containers first — ensures empty state for unconfigured months
  ['holidays','leave','travel','related'].forEach(function(t) {
    var c = document.getElementById(t + '-container');
    if (c) c.innerHTML = '';
  });

  if (!raw) return;  // nothing saved for this month → leave blank
  var data; try { data = JSON.parse(raw); } catch(e) { return; }

  function restoreRows(type, rows, fields) {
    var container = document.getElementById(type + '-container');
    if (!container || !rows || !rows.length) return;
    rows.forEach(function(rowData) {
      addRow(type);  // _restoringForm flag prevents premature saves inside addRow
      var lastRow = container.lastElementChild;
      if (!lastRow) return;
      fields.forEach(function(name) {
        var el = lastRow.querySelector('[name="' + name + '"]');
        if (el && rowData[name] !== undefined) el.value = rowData[name];
      });
      // Restore time-slots visibility for related rows
      if (rowData['_timeVisible']) {
        var ts  = lastRow.querySelector('.time-slots');
        var btn = lastRow.querySelector('.btn-add-time');
        if (ts)  ts.style.display = 'flex';
        if (btn) btn.textContent  = '\u2212 Remove time';
      }
    });
  }

  _restoringForm = true;  // suppress per-addRow saves
  restoreRows('holidays', data.holidays, ['holiday_date[]','holiday_label[]']);
  restoreRows('leave',    data.leave,    ['leave_date[]','leave_type[]']);
  restoreRows('travel',   data.travel,   ['travel_start[]','travel_end[]','travel_ta[]']);
  restoreRows('related',  data.related,  ['related_start[]','related_end[]','related_time_in[]','related_time_out[]']);
  _restoringForm = false;

  // One definitive save after all fields are filled with their correct values.
  // _activeMonthKey already points to the new month, so this is safe.
  serializeGenerateForm();
}

/* ── Setup page init ────────────────────────────────────────────── */
function initSetupPage() {
  restoreProfile();

  ['faculty_name','designation','department','dept_head'].forEach(function(f) {
    var el = document.getElementById(f);
    if (el) el.addEventListener('input', saveProfile);
  });

  // Build calendar widget
  var calContainer = document.getElementById('cal-container');
  if (calContainer && window.calendarWidget) {
    var initData = null;

    // 1. Try server-rendered initial data — only use it if it has actual blocks
    var serverEl = document.getElementById('schedule-initial');
    if (serverEl) {
      try {
        var parsed = JSON.parse(serverEl.textContent);
        var hasBlocks = parsed && Object.keys(parsed).some(function(day) {
          return Array.isArray(parsed[day]) && parsed[day].length > 0;
        });
        if (hasBlocks) initData = parsed;
      } catch(e) {}
    }

    // 2. Fall back to localStorage
    if (!initData) initData = lsGetJSON(LS_SCHEDULE);

    calendarWidget.build(calContainer, initData);
  }

  // Populate preset dropdown
  populatePresetSelect();

  // Wire preset buttons
  var btnLoad = document.getElementById('btn-load-preset');
  var btnSave = document.getElementById('btn-save-preset');
  var btnDel  = document.getElementById('btn-del-preset');
  if (btnLoad) btnLoad.addEventListener('click', loadPreset);
  if (btnSave) btnSave.addEventListener('click', savePreset);
  if (btnDel)  btnDel.addEventListener('click',  deletePreset);

  // On form submit: ensure everything is saved
  var form = document.getElementById('setup-form');
  if (form) {
    form.addEventListener('submit', function() {
      saveProfile();
      if (window.calendarWidget) calendarWidget.save();
    });
  }
}

/* ── Generate page: explicit Save button ────────────────────────── */
function saveStep2(btn) {
  serializeGenerateForm();
  if (!btn) return;
  var origHTML = btn.innerHTML;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Saved';
  btn.disabled = true;
  setTimeout(function() { btn.innerHTML = origHTML; btn.disabled = false; }, 1800);
}

/* ── Generate page init ─────────────────────────────────────────── */
function initGeneratePage() {
  restoreMonthYear();
  populateHiddenFields();
  // restoreGenerateForm() sets _activeMonthKey = getMonthKey() internally,
  // so it's always initialised before any user interaction can trigger a save.
  restoreGenerateForm();

  var m = document.getElementById('month');
  var y = document.getElementById('year');

  function onMonthYearChange() {
    // 1. Save current form state to the OLD month key.
    //    _activeMonthKey still points to the previous month because
    //    restoreGenerateForm() (which advances it) hasn't run yet.
    serializeGenerateForm();
    // 2. Persist the new month/year selection
    saveMonthYear();
    // 3. Load data for the new month.
    //    restoreGenerateForm() sets _activeMonthKey = getMonthKey() (new month)
    //    before reading/restoring, so the subsequent final serializeGenerateForm()
    //    inside it writes to the new month's key — not the old one.
    restoreGenerateForm();
  }

  if (m) m.addEventListener('change', onMonthYearChange);
  if (y) y.addEventListener('change', onMonthYearChange);

  // Auto-save on any form interaction
  var form = document.getElementById('generate-form');
  if (form) {
    form.addEventListener('change', serializeGenerateForm);
    form.addEventListener('input',  serializeGenerateForm);
  }
}

/* ── Generate-page: spinner on preview submit ───────────────────── */
(function() {
  var form    = document.getElementById('generate-form');
  var overlay = document.getElementById('loading-overlay');
  var btn     = document.getElementById('generate-btn');
  if (!form || !overlay) return;
  form.addEventListener('submit', function() {
    populateHiddenFields();
    overlay.classList.add('active');
    if (btn) { btn.disabled = true; btn.textContent = 'Building preview\u2026'; }
    setTimeout(function() {
      overlay.classList.remove('active');
      if (btn) { btn.disabled = false; btn.textContent = '\uD83D\uDC41 Preview FDTR'; }
    }, 30000);
  });
})();

/* ── Page dispatcher ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('setup-form'))    initSetupPage();
  if (document.getElementById('generate-form')) initGeneratePage();
});
