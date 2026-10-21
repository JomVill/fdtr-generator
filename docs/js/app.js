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
  // New dates start inside the chosen month: today if it's in that month, else the 1st
  var m = parseInt((document.getElementById('month') || {}).value, 10);
  var y = parseInt((document.getElementById('year')  || {}).value, 10);
  var now = new Date();
  var day = (now.getFullYear() === y && now.getMonth() + 1 === m) ? now.getDate() : 1;
  var start = (m && y) ? y + '-' + ('0' + m).slice(-2) + '-' + ('0' + day).slice(-2)
                       : now.toISOString().slice(0, 10);
  clone.querySelectorAll("input[type='date']").forEach(function (el) {
    el.value = start;
  });
  container.appendChild(clone);
  var added = container.lastElementChild;
  if (added && added.classList.contains('date-range')) setRangeMode(added, false);
  if (!_restoringForm) {
    serializeGenerateForm();
    // Put the cursor in the new row so people can type right away
    var row = container.lastElementChild;
    var first = row && row.querySelector('input[type="text"], select, input');
    if (first) first.focus();
  }
}

function removeRow(btn) {
  var row = btn.closest('.dynamic-row');
  if (row) row.remove();
  serializeGenerateForm();
}

/* ── Date ranges (travel, suspended classes): one day unless expanded ── */
// While a row is "one day", its hidden end date simply copies the start date,
// so the saved data and the FDTR generator work exactly as before.
function setRangeMode(row, many) {
  var wrap  = row.querySelector('.range-end-wrap');
  var btn   = row.querySelector('.btn-range');
  var start = row.querySelector('.range-start');
  var end   = row.querySelector('.range-end');
  if (!wrap || !start || !end) return;
  row.classList.toggle('is-range', many);
  wrap.hidden = !many;
  if (btn) btn.hidden = many;
  start.setAttribute('aria-label', many ? 'First day' : 'Date');
  end.min = start.value || '';
  if (!many || !end.value || end.value < start.value) end.value = start.value;
}

function toggleRange(btn, many) {
  var row = btn.closest('.dynamic-row');
  setRangeMode(row, many);
  serializeGenerateForm();
  var focusEl = many ? row.querySelector('.range-end') : row.querySelector('.btn-range');
  if (focusEl) {
    focusEl.focus();
    // Open the calendar picker straight away where the browser allows it
    if (many && focusEl.showPicker) { try { focusEl.showPicker(); } catch (e) {} }
  }
}

// Keep each row's end date in step with its start date
function onRangeInput(e) {
  var t = e.target;
  if (!t.classList) return;
  var row = t.closest('.dynamic-row');
  if (t.classList.contains('range-start')) {
    setRangeMode(row, row.classList.contains('is-range'));
  } else if (t.classList.contains('range-end') && e.type === 'change') {
    // A last day before the first day isn't possible — snap it back
    var start = row.querySelector('.range-start');
    if (t.value && start.value && t.value < start.value) t.value = start.value;
  }
}

function syncAllRanges() {
  document.querySelectorAll('.dynamic-row.date-range').forEach(function (row) {
    var s = row.querySelector('.range-start'), e = row.querySelector('.range-end');
    setRangeMode(row, !!(e && e.value && s && e.value !== s.value));
  });
}

/* ── Time toggle on Related Activities rows ─────────────────────── */
function toggleTime(btn) {
  var row   = btn.closest('.dynamic-row');
  var slots = row.querySelector('.time-slots');
  if (!slots) return;
  // Read what's actually shown — the inline style is empty until the first toggle
  var isVisible = getComputedStyle(slots).display !== 'none';
  slots.style.display = isVisible ? 'none' : 'flex';
  btn.textContent = isVisible ? '+ Set times' : '\u2212 Use default times';
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
  sel.innerHTML = '<option value="">Choose a saved schedule\u2026</option>';
  var presets = getPresets();
  Object.keys(presets).sort().forEach(function (name) {
    var opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    sel.appendChild(opt);
  });
  if (current && presets[current]) sel.value = current;
}

function savePreset() {
  var name = (window.prompt ? window.prompt('Give this schedule a name (for example \u201C1st Sem 2026\u201D):') : null);
  if (!name || !name.trim()) return;
  name = name.trim();

  if (window.calendarWidget) calendarWidget.save();
  var current = lsGet(LS_SCHEDULE);
  if (!current) { alert('Your weekly schedule is empty. Add some time blocks first.'); return; }

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
  if (window.calendarWidget) calendarWidget.load(parsed, { undoMessage: 'Loaded \u201C' + sel.value + '\u201D.' });
}

function deletePreset() {
  var sel = document.getElementById('preset-select');
  if (!sel || !sel.value) return;
  if (!window.confirm('Delete the saved schedule \u201C' + sel.value + '\u201D? Your current week on the calendar stays as it is.')) return;
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
      if (ts) obj['_timeVisible'] = getComputedStyle(ts).display !== 'none';
      rows.push(obj);
    });
    return rows;
  }

  var data = {
    holidays: getRows('holidays-container', ['holiday_date[]','holiday_end[]','holiday_label[]']),
    leave:    getRows('leave-container',    ['leave_date[]','leave_end[]','leave_type[]']),
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
        if (btn) btn.textContent  = '\u2212 Use default times';
      }
    });
  }

  _restoringForm = true;
  restoreRows('holidays', data.holidays, ['holiday_date[]','holiday_end[]','holiday_label[]']);
  restoreRows('leave',    data.leave,    ['leave_date[]','leave_end[]','leave_type[]']);
  restoreRows('travel',   data.travel,   ['travel_start[]','travel_end[]','travel_ta[]']);
  restoreRows('related',  data.related,  ['related_start[]','related_end[]','related_time_in[]','related_time_out[]']);
  _restoringForm = false;

  syncAllRanges();
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

/* ── Setup page: explicit Save button ───────────────────────────── */
function saveSetup(btn) {
  saveProfile();
  if (window.calendarWidget) calendarWidget.save();
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

  // Holiday and leave rows can cover several days. The FDTR builder takes one
  // date per entry, so a range becomes one entry per day. Weekends with no
  // scheduled blocks are skipped (same rule as suspended classes) so they stay
  // plain SAT/SUN; a single chosen date is always kept as-is.
  function expandDays(startName, endName, valueName) {
    var starts = collectList(startName), ends = collectList(endName), vals = collectList(valueName);
    var dates = [], values = [];
    function iso(dt) {
      return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
    }
    function parse(str) {
      var p = (str || '').split('-');
      return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
    }
    var dayKeys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    starts.forEach(function (st, i) {
      var a = parse(st), b = parse(ends[i]) || a;
      if (!a) { dates.push(st); values.push(vals[i]); return; }   // keep as-is (blank, etc.)
      if (b < a) b = a;
      if (b.getTime() === a.getTime()) { dates.push(st); values.push(vals[i]); return; }
      for (var d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
        var wd = d.getDay();
        if (wd === 0 || wd === 6) {
          var blocks = schedule[dayKeys[wd]];
          if (!blocks || !blocks.length) continue;
        }
        dates.push(iso(d));
        values.push(vals[i]);
      }
    });
    return { dates: dates, values: values };
  }
  var hol   = expandDays('holiday_date[]', 'holiday_end[]', 'holiday_label[]');
  var leave = expandDays('leave_date[]',   'leave_end[]',   'leave_type[]');

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
    holiday_dates:  hol.dates,
    holiday_labels: hol.values,
    leave_dates:    leave.dates,
    leave_types:    leave.values,
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
/* ── Generate page: tabs, counts, month summary, saved status ───── */
var GEN_TYPES = ['holidays', 'leave', 'travel', 'related'];
var GEN_MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

function genRowCount(type) {
  var c = document.getElementById(type + '-container');
  return c ? c.querySelectorAll('.dynamic-row').length : 0;
}

// Days that will actually be marked on the FDTR for a tab's rows.
// Matches how they're recorded: in a range, weekends with nothing scheduled are
// skipped (except for travel, which marks every day); a single date always counts.
function genDayCount(type) {
  var c = document.getElementById(type + '-container');
  if (!c) return 0;
  var sched = lsGetJSON(LS_SCHEDULE) || {};
  var keys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  var total = 0;
  c.querySelectorAll('.dynamic-row').forEach(function (row) {
    var st = row.querySelector('.range-start'), en = row.querySelector('.range-end');
    if (!st || !st.value) return;
    var a = new Date(st.value + 'T00:00'), b = new Date(((en && en.value) || st.value) + 'T00:00');
    if (!(b > a)) { total += 1; return; }
    for (var d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      var wd = d.getDay();
      if (type !== 'travel' && (wd === 0 || wd === 6)) {
        var blocks = sched[keys[wd]];
        if (!blocks || !blocks.length) continue;
      }
      total++;
    }
  });
  return total;
}

function selectGenTab(type, focus) {
  GEN_TYPES.forEach(function (t) {
    var tab = document.getElementById('tab-' + t);
    var panel = document.getElementById('panel-' + t);
    if (!tab || !panel) return;
    var on = t === type;
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
    if (on && focus) tab.focus();
  });
}

function updateGenSummary() {
  var m = parseInt((document.getElementById('month') || {}).value, 10);
  var y = parseInt((document.getElementById('year')  || {}).value, 10);
  var list = document.getElementById('gen-summary');

  GEN_TYPES.forEach(function (t) {
    var badge = document.querySelector('[data-count="' + t + '"]');
    if (!badge) return;
    var n = genRowCount(t);
    badge.textContent = n;
    badge.classList.toggle('is-zero', n === 0);
  });
  if (!list || !m || !y) return;

  var weekdays = 0, days = new Date(y, m, 0).getDate();
  for (var d = 1; d <= days; d++) {
    var wd = new Date(y, m - 1, d).getDay();
    if (wd !== 0 && wd !== 6) weekdays++;
  }
  var items = ['<li class="gen-summary-main">' + GEN_MONTHS[m - 1] + ' ' + y + ' has <strong>' +
               weekdays + ' weekdays</strong>.</li>'];
  var parts = [
    ['holidays', 'holiday'],
    ['leave',    'leave'],
    ['travel',   'travel'],
    ['related',  'suspended classes']
  ];
  var any = false;
  parts.forEach(function (p) {
    var n = genDayCount(p[0]);
    if (n) { any = true; items.push('<li>' + n + ' day' + (n === 1 ? '' : 's') + ' of ' + p[1] + '</li>'); }
  });
  if (!any) items.push('<li class="gen-summary-none">No changes added &mdash; your normal schedule will be used.</li>');
  list.innerHTML = items.join('');
}

function initGenerateLayout() {
  var tablist = document.querySelector('.gen-tabs');
  if (tablist) {
    tablist.addEventListener('click', function (e) {
      var tab = e.target.closest('.gen-tab');
      if (tab) selectGenTab(tab.getAttribute('data-type'));
    });
    // Arrow keys move between tabs (standard tab behaviour)
    tablist.addEventListener('keydown', function (e) {
      var i = GEN_TYPES.indexOf(document.activeElement.getAttribute('data-type'));
      if (i < 0) return;
      var next = null;
      if (e.key === 'ArrowRight') next = GEN_TYPES[(i + 1) % GEN_TYPES.length];
      else if (e.key === 'ArrowLeft') next = GEN_TYPES[(i + GEN_TYPES.length - 1) % GEN_TYPES.length];
      else if (e.key === 'Home') next = GEN_TYPES[0];
      else if (e.key === 'End') next = GEN_TYPES[GEN_TYPES.length - 1];
      if (next) { e.preventDefault(); selectGenTab(next, true); }
    });
  }

  // Counts + summary follow rows being added/removed (including month switches)
  var obs = new MutationObserver(updateGenSummary);
  GEN_TYPES.forEach(function (t) {
    var c = document.getElementById(t + '-container');
    if (c) obs.observe(c, { childList: true });
  });

  // Open the first tab that already has entries
  var firstFilled = GEN_TYPES.filter(function (t) { return genRowCount(t) > 0; })[0];
  selectGenTab(firstFilled || 'holidays');
  updateGenSummary();

  // "Saved automatically" blinks after each change so people can see it worked
  var saved = document.getElementById('gen-saved');
  var form = document.getElementById('generate-form');
  var t = null;
  if (saved && form) {
    form.addEventListener('change', updateGenSummary);
    form.addEventListener('input', function () {
      updateGenSummary();
      saved.classList.add('is-flash');
      clearTimeout(t);
      t = setTimeout(function () { saved.classList.remove('is-flash'); }, 1200);
    });
  }
}

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
  initGenerateLayout();
  if (m) m.addEventListener('change', updateGenSummary);
  if (y) y.addEventListener('change', updateGenSummary);

  var form = document.getElementById('generate-form');
  if (form) {
    form.addEventListener('input',  onRangeInput);
    form.addEventListener('change', onRangeInput);
    form.addEventListener('change', serializeGenerateForm);
    form.addEventListener('input',  serializeGenerateForm);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      serializeGenerateForm();

      var payload = buildPayload();
      if (!payload.profile.faculty_name) {
        alert('Please fill in your name and details on the Setup page first.');
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
        alert('Sorry, the preview couldn\u2019t be made. Please check the dates you entered and try again.\n\nDetails: ' + (err && err.message ? err.message : err));
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
    if (!window.confirm('Start over?\n\nThis deletes everything saved in this browser: your details, weekly schedule, saved schedules, monthly entries and past records. It can\u2019t be undone.\n\nTip: use \u201CBackup & restore\u201D first if you might need any of it.')) {
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
