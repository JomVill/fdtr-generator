/* ============================================================
   FDTR Generator — Client-side JS v3 (static build)
   localStorage persistence · Dynamic rows · Named presets
   Per-month Step-2 data · Spinner · No backend
   ============================================================ */

"use strict";

/* ── localStorage keys ──────────────────────────────────────── */
var LS_PROFILE    = 'fdtr_profile';
var LS_SCHEDULE   = 'fdtr_schedule';
var LS_LAST_MONTH = 'fdtr_last_month';
var LS_LAST_YEAR  = 'fdtr_last_year';
var LS_PRESETS    = 'fdtr_schedule_presets';
var LS_PREVIEW    = 'fdtr_preview_payload';   // sessionStorage, handoff to preview page

/* ── Storage helpers ──────────────────────────────────────────── */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch (e) {}
}
function lsGetJSON(key) {
  var raw = lsGet(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/* ── Dynamic rows (generate page) ──────────────────────────────── */

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
  clone.querySelectorAll("input[type='date']").forEach(function (el) {
    el.value = today;
  });
  container.appendChild(clone);
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
  ['faculty_name','designation','department','dept_head'].forEach(function (f) {
    var el = document.getElementById(f);
    p[f] = el ? el.value : '';
  });
  lsSet(LS_PROFILE, JSON.stringify(p));
}

function restoreProfile() {
  var p = lsGetJSON(LS_PROFILE);
  if (!p) return;
  ['faculty_name','designation','department','dept_head'].forEach(function (f) {
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
  sel.innerHTML = '<option value="">\u2014 Load saved schedule \u2014</option>';
  var presets = getPresets();
  Object.keys(presets).sort().forEach(function (name) {
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
  if (btn) {
    var orig = btn.textContent;
    btn.textContent = '\u2713 Saved';
    setTimeout(function () { btn.textContent = orig; }, 1600);
  }
}

function loadPreset() {
  var sel = document.getElementById('preset-select');
  if (!sel || !sel.value) return;
  var presets = getPresets();
  var raw = presets[sel.value];
  if (!raw) return;
  var parsed; try { parsed = JSON.parse(raw); } catch (e) { return; }
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

/* ── Generate page: faculty name in header ─────────────────────── */
function populateGenerateHeader() {
  var p = lsGetJSON(LS_PROFILE) || {};
  var nm = document.getElementById('gen-faculty-name');
  var dp = document.getElementById('gen-faculty-dept');
  if (nm) nm.textContent = p.faculty_name || '(faculty name)';
  if (dp) dp.textContent = p.department  || '(department)';
}

/* ── Per-month Step-2 form data ─────────────────────────────────── */

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
    container.querySelectorAll('.dynamic-row').forEach(function (row) {
      var obj = {};
      fields.forEach(function (name) {
        var el = row.querySelector('[name="' + name + '"]');
        obj[name] = el ? el.value : '';
      });
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
  var key = _activeMonthKey || getMonthKey();
  lsSet(key, JSON.stringify(data));
}

function restoreGenerateForm() {
  if (!document.getElementById('generate-form')) return;

  _activeMonthKey = getMonthKey();
  var raw = lsGet(_activeMonthKey);

  ['holidays','leave','travel','related'].forEach(function (t) {
    var c = document.getElementById(t + '-container');
    if (c) c.innerHTML = '';
  });

  if (!raw) return;
  var data; try { data = JSON.parse(raw); } catch (e) { return; }

  function restoreRows(type, rows, fields) {
    var container = document.getElementById(type + '-container');
    if (!container || !rows || !rows.length) return;
    rows.forEach(function (rowData) {
      addRow(type);
      var lastRow = container.lastElementChild;
      if (!lastRow) return;
      fields.forEach(function (name) {
        var el = lastRow.querySelector('[name="' + name + '"]');
        if (el && rowData[name] !== undefined) el.value = rowData[name];
      });
      if (rowData['_timeVisible']) {
        var ts  = lastRow.querySelector('.time-slots');
        var btn = lastRow.querySelector('.btn-add-time');
        if (ts)  ts.style.display = 'flex';
        if (btn) btn.textContent  = '\u2212 Remove time';
      }
    });
  }

  _restoringForm = true;
  restoreRows('holidays', data.holidays, ['holiday_date[]','holiday_label[]']);
  restoreRows('leave',    data.leave,    ['leave_date[]','leave_type[]']);
  restoreRows('travel',   data.travel,   ['travel_start[]','travel_end[]','travel_ta[]']);
  restoreRows('related',  data.related,  ['related_start[]','related_end[]','related_time_in[]','related_time_out[]']);
  _restoringForm = false;

  serializeGenerateForm();
}

/* ── Populate Month / Year dropdowns (replaces Jinja loops) ────── */
function populateMonthYearDropdowns() {
  var m = document.getElementById('month');
  var y = document.getElementById('year');
  if (!m || !y) return;

  var MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  var today = new Date();
  var curMonth = today.getMonth() + 1;
  var curYear  = today.getFullYear();

  if (!m.options.length) {
    for (var i = 0; i < 12; i++) {
      var opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = MONTHS[i];
      if (i + 1 === curMonth) opt.selected = true;
      m.appendChild(opt);
    }
  }

  if (!y.options.length) {
    for (var yr = curYear - 1; yr <= curYear + 2; yr++) {
      var o = document.createElement('option');
      o.value = String(yr);
      o.textContent = String(yr);
      if (yr === curYear) o.selected = true;
      y.appendChild(o);
    }
  }
}

/* ── Populate Leave type select on every new leave row ─────────── */
var LEAVE_TYPES = [
  'Vacation Leave','Sick Leave','Monetization','Faculty Sick Leave',
  'Special Leave','Compensatory Leave','Study Leave','Maternity Leave',
  'Paternity Leave','Solo Parent Leave','Special Leave for Women',
  'Special Emergency Leave','AVAWC Leave','Adoption Leave',
  'Rehabilitation Leave','Sabbatical Leave','Wellness Leave'
];

function ensureLeaveTypeOptions() {
  var tmpl = document.getElementById('leave-row-template');
  if (!tmpl) return;
  var sel  = tmpl.content.querySelector('select[name="leave_type[]"]');
  if (!sel || sel.options.length) return;
  LEAVE_TYPES.forEach(function (lt) {
    var opt = document.createElement('option');
    opt.value = lt; opt.textContent = lt;
    sel.appendChild(opt);
  });
}

/* ── Setup page init ────────────────────────────────────────────── */
function initSetupPage() {
  restoreProfile();

  ['faculty_name','designation','department','dept_head'].forEach(function (f) {
    var el = document.getElementById(f);
    if (el) el.addEventListener('input', saveProfile);
  });

  var calContainer = document.getElementById('cal-container');
  if (calContainer && window.calendarWidget) {
    var initData = lsGetJSON(LS_SCHEDULE);
    calendarWidget.build(calContainer, initData);
  }

  populatePresetSelect();

  var btnLoad = document.getElementById('btn-load-preset');
  var btnSave = document.getElementById('btn-save-preset');
  var btnDel  = document.getElementById('btn-del-preset');
  if (btnLoad) btnLoad.addEventListener('click', loadPreset);
  if (btnSave) btnSave.addEventListener('click', savePreset);
  if (btnDel)  btnDel.addEventListener('click',  deletePreset);

  var form = document.getElementById('setup-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveProfile();
      if (window.calendarWidget) calendarWidget.save();
      location.href = 'generate.html';
    });
  }
}

/* ── Schedule export / import ───────────────────────────────────── */
function exportSchedule() {
  if (window.calendarWidget) calendarWidget.save();
  var sched = lsGet(LS_SCHEDULE);
  if (!sched) { alert('No schedule saved yet \u2014 draw some blocks first.'); return; }
  var blob = new Blob([sched], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'fdtr-schedule.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importSchedule(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var parsed = JSON.parse(e.target.result);
      var days   = ['monday','tuesday','wednesday','thursday','friday'];
      var valid  = parsed && typeof parsed === 'object' &&
                   days.some(function (d) { return Array.isArray(parsed[d]); });
      if (!valid) throw new Error('invalid');
      lsSet(LS_SCHEDULE, JSON.stringify(parsed));
      if (window.calendarWidget) calendarWidget.load(parsed);
    } catch (err) {
      alert('Invalid file \u2014 please use a schedule exported from this app.');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

/* ── Generate page: explicit Save button ────────────────────────── */
function saveStep2(btn) {
  serializeGenerateForm();
  if (!btn) return;
  var origHTML = btn.innerHTML;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Saved';
  btn.disabled = true;
  setTimeout(function () { btn.innerHTML = origHTML; btn.disabled = false; }, 1800);
}

/* ── Build payload for preview / download (from form + localStorage) ── */
function buildPayload() {
  var profile = lsGetJSON(LS_PROFILE) || {};

  var schedule = lsGetJSON(LS_SCHEDULE) || {};
  ['monday','tuesday','wednesday','thursday','friday'].forEach(function (d) {
    if (!Array.isArray(schedule[d])) schedule[d] = [];
  });

  var m = parseInt((document.getElementById('month') || {}).value || '1', 10);
  var y = parseInt((document.getElementById('year')  || {}).value || '2026', 10);

  function collectList(name) {
    var out = [];
    document.querySelectorAll('[name="' + name + '"]').forEach(function (el) {
      out.push((el.value || '').trim());
    });
    return out;
  }

  return {
    profile: {
      faculty_name: (profile.faculty_name || '').trim().toUpperCase(),
      designation:  (profile.designation  || '').trim(),
      department:   (profile.department   || '').trim().toUpperCase(),
      dept_head:    (profile.dept_head    || '').trim().toUpperCase(),
    },
    month: m,
    year:  y,
    schedule: schedule,
    holiday_dates:  collectList('holiday_date[]'),
    holiday_labels: collectList('holiday_label[]'),
    leave_dates:    collectList('leave_date[]'),
    leave_types:    collectList('leave_type[]'),
    travel_starts:  collectList('travel_start[]'),
    travel_ends:    collectList('travel_end[]'),
    travel_tas:     collectList('travel_ta[]'),
    rel_starts:     collectList('related_start[]'),
    rel_ends:       collectList('related_end[]'),
    rel_time_ins:   collectList('related_time_in[]'),
    rel_time_outs:  collectList('related_time_out[]'),
  };
}

/* ── Generate page init ─────────────────────────────────────────── */
function initGeneratePage() {
  // Require profile; else bounce to setup
  var p = lsGetJSON(LS_PROFILE);
  if (!p || !(p.faculty_name && String(p.faculty_name).trim())) {
    location.replace('setup.html');
    return;
  }

  populateMonthYearDropdowns();
  ensureLeaveTypeOptions();

  restoreMonthYear();
  populateGenerateHeader();
  restoreGenerateForm();

  var m = document.getElementById('month');
  var y = document.getElementById('year');

  function onMonthYearChange() {
    serializeGenerateForm();
    saveMonthYear();
    restoreGenerateForm();
  }
  if (m) m.addEventListener('change', onMonthYearChange);
  if (y) y.addEventListener('change', onMonthYearChange);

  var form = document.getElementById('generate-form');
  if (form) {
    form.addEventListener('change', serializeGenerateForm);
    form.addEventListener('input',  serializeGenerateForm);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      serializeGenerateForm();

      var payload = buildPayload();
      if (!payload.profile.faculty_name) {
        alert('Please fill in your profile on the Setup page first.');
        location.href = 'setup.html';
        return;
      }

      try {
        var specialDays = window.buildSpecialDays(payload);
        var preview     = window.generatePreviewData(payload, specialDays);
        // Stash both — preview page uses `preview` for rendering and `payload`
        // for the download click (regenerates .xlsx on demand).
        sessionStorage.setItem(LS_PREVIEW, JSON.stringify({
          payload: payload,
          preview: preview,
        }));
        location.href = 'preview.html';
      } catch (err) {
        console.error(err);
        alert('Preview failed: ' + (err && err.message ? err.message : err));
      }
    });
  }
}

/* ── Reset link: clears ALL fdtr_* keys, returns to setup ──────── */
function initResetLink() {
  var link = document.querySelector('.nav-reset');
  if (!link) return;
  link.addEventListener('click', function (e) {
    e.preventDefault();
    if (!window.confirm('Clear all saved data (profile, schedule, presets, month inputs)? This cannot be undone.')) {
      return;
    }
    try {
      var toDelete = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('fdtr_') === 0) toDelete.push(k);
      }
      toDelete.forEach(function (k) { localStorage.removeItem(k); });
      sessionStorage.removeItem(LS_PREVIEW);
    } catch (e) {}
    location.href = 'setup.html';
  });
}

/* ── Page dispatcher ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  initResetLink();
  if (document.getElementById('setup-form'))    initSetupPage();
  if (document.getElementById('generate-form')) initGeneratePage();
});
