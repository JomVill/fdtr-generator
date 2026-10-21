/* ============================================================
   FDTR Generator — Your data: backup file, restore, past records
   Everything lives in this browser's localStorage (fdtr_* keys).
   A backup is one .json file holding all of it, so a person can
   move to a new computer or browser without retyping anything.
   ============================================================ */

(function () {
  "use strict";

  var LS_HISTORY     = 'fdtr_history';       // [{ id, month, year, savedAt, payload }]
  var LS_LAST_BACKUP = 'fdtr_last_backup';   // ISO date of the last backup download
  var SS_RESTORED    = 'fdtr_restored_note'; // one-time "restored" message after reload
  var BACKUP_KIND    = 'fdtr-backup';
  var MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
  var WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  // ── Storage helpers ────────────────────────────────────────────────────
  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); return true; } catch (e) { return false; } }
  function getJSON(key, fallback) {
    try { var v = JSON.parse(get(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function appKeys() {
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('fdtr_') === 0) keys.push(k);
      }
    } catch (e) {}
    return keys;
  }
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function niceDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  // ── Toast (same look as the calendar's) ────────────────────────────────
  // onUndo (optional): adds an Undo button that calls it
  function toast(msg, onUndo) {
    var old = document.querySelector('.cal-toast');
    if (old) old.remove();
    var t = el('<div class="cal-toast" role="status"><span class="cal-toast-msg"></span>' +
               (onUndo ? '<button type="button" class="cal-toast-undo">Undo</button>' : '') +
               '<button type="button" class="cal-toast-close" aria-label="Dismiss">' +
               '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
               'stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/>' +
               '<line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>');
    t.querySelector('.cal-toast-msg').textContent = msg;
    t.querySelector('.cal-toast-close').addEventListener('click', function () { t.remove(); });
    if (onUndo) {
      t.querySelector('.cal-toast-undo').addEventListener('click', function () { t.remove(); onUndo(); });
    }
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 7000);
  }

  // ── Past records (history of downloaded FDTRs) ─────────────────────────
  function getHistory() {
    var h = getJSON(LS_HISTORY, []);
    return Array.isArray(h) ? h : [];
  }
  // Keep the latest download for each month; newest month first
  function recordHistory(payload) {
    if (!payload || !payload.month || !payload.year) return;
    var id = payload.year + '-' + ('0' + payload.month).slice(-2);
    var h = getHistory().filter(function (r) { return r.id !== id; });
    h.push({ id: id, month: payload.month, year: payload.year,
             savedAt: new Date().toISOString(), payload: payload });
    h.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    set(LS_HISTORY, JSON.stringify(h));
  }
  function removeHistory(id) {
    set(LS_HISTORY, JSON.stringify(getHistory().filter(function (r) { return r.id !== id; })));
  }
  function downloadFromHistory(id) {
    var rec = getHistory().filter(function (r) { return r.id === id; })[0];
    if (!rec) return Promise.reject(new Error('Record not found'));
    var special = window.buildSpecialDays(rec.payload);
    var p = window.generateFdtr(rec.payload, special);
    return (p && typeof p.then === 'function') ? p : Promise.resolve();
  }

  // ── Backup file ────────────────────────────────────────────────────────
  function buildBackup() {
    var data = {};
    appKeys().forEach(function (k) { data[k] = get(k); });
    var profile = getJSON('fdtr_profile', {}) || {};
    return {
      app: 'fdtr-generator',
      kind: BACKUP_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      owner: profile.faculty_name || '',
      data: data
    };
  }

  function downloadBackup() {
    var backup = buildBackup();
    var name = (backup.owner || 'my')
      .replace(/,.*$/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my';
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'fdtr-backup-' + name + '-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    set(LS_LAST_BACKUP, new Date().toISOString());
  }

  // Reads a backup file (or an older schedule-only file) → { kind, summary, apply() }
  function readBackupFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read')); };
      reader.onload = function () {
        var parsed;
        try { parsed = JSON.parse(reader.result); } catch (e) { reject(new Error('format')); return; }

        // Full backup
        if (parsed && parsed.kind === BACKUP_KIND && parsed.data && typeof parsed.data === 'object') {
          var d = parsed.data;
          var hist = [];
          try { hist = JSON.parse(d[LS_HISTORY] || '[]') || []; } catch (e) {}
          var sched = {};
          try { sched = JSON.parse(d.fdtr_schedule || '{}') || {}; } catch (e) {}
          var blocks = WEEKDAYS.reduce(function (n, day) {
            return n + (Array.isArray(sched[day]) ? sched[day].length : 0);
          }, 0);
          resolve({
            kind: 'full',
            summary: {
              owner: parsed.owner || '',
              date: niceDate(parsed.exportedAt),
              blocks: blocks,
              records: hist.length
            },
            apply: function () {
              // Replace this browser's data with the backup's
              appKeys().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
              Object.keys(d).forEach(function (k) {
                if (k.indexOf('fdtr_') === 0 && typeof d[k] === 'string') set(k, d[k]);
              });
            }
          });
          return;
        }

        // Older schedule-only file (from the previous "Export" button)
        var isSchedule = parsed && typeof parsed === 'object' &&
          WEEKDAYS.some(function (day) { return Array.isArray(parsed[day]); });
        if (isSchedule) {
          var n = WEEKDAYS.reduce(function (c, day) {
            return c + (Array.isArray(parsed[day]) ? parsed[day].length : 0);
          }, 0);
          resolve({
            kind: 'schedule',
            summary: { owner: '', date: '', blocks: n, records: 0 },
            apply: function () { set('fdtr_schedule', JSON.stringify(parsed)); }
          });
          return;
        }
        reject(new Error('format'));
      };
      reader.readAsText(file);
    });
  }

  // ── "Backup & restore" dialog ──────────────────────────────────────────
  var ICON_BACKUP =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var dialog = null;

  function buildDialog() {
    var hasData = !!(get('fdtr_profile') || get('fdtr_schedule'));
    var last = get(LS_LAST_BACKUP);
    var nRecords = getHistory().length;

    dialog = el(
      '<div class="data-modal" role="dialog" aria-modal="true" aria-labelledby="data-modal-title">' +
        '<div class="data-modal-card">' +
          '<div class="data-modal-head">' +
            '<h2 id="data-modal-title">Backup &amp; restore</h2>' +
            '<button type="button" class="pop-close" data-act="close" aria-label="Close">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
              'stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
          '<p class="data-modal-lead">Your information is saved only in this browser. It is deleted if you ' +
            'clear your browsing data or cookies, and other computers can\u2019t see it. A backup file keeps it safe ' +
            'and lets you open it anywhere.</p>' +

          '<section class="data-step">' +
            '<span class="data-step-num">1</span>' +
            '<div>' +
              '<h3>On this computer: save a backup file</h3>' +
              '<p>One file with your profile, weekly schedule, saved schedules, monthly entries' +
                (nRecords ? ' and ' + nRecords + ' past record' + (nRecords > 1 ? 's' : '') : ' and past records') +
                '. Keep it on a USB drive, email it to yourself, or save it to Google Drive.</p>' +
              '<button type="button" class="btn btn-primary data-btn" data-act="backup"' + (hasData ? '' : ' disabled') + '>' +
                ICON_BACKUP + ' Download backup file</button>' +
              '<p class="data-note">' + (hasData
                ? (last ? 'Last backup: ' + esc(niceDate(last)) + '.' : 'You haven’t made a backup yet.')
                : 'Nothing to back up yet — fill in your profile or schedule first.') + '</p>' +
            '</div>' +
          '</section>' +

          '<section class="data-step">' +
            '<span class="data-step-num">2</span>' +
            '<div>' +
              '<h3>On the new computer: open the backup file</h3>' +
              '<p>Open this website on the other computer, click <strong>Backup &amp; restore</strong>, ' +
                'then choose the file. Files from the old <em>Export</em> button work too.</p>' +
              '<label class="btn btn-secondary data-btn">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
                '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
                ' Choose backup file…' +
                '<input type="file" accept=".json,application/json" data-act="file" hidden/>' +
              '</label>' +
              '<div class="data-restore" hidden></div>' +
            '</div>' +
          '</section>' +
        '</div>' +
      '</div>');

    dialog.addEventListener('click', function (e) {
      var act = e.target.closest && e.target.closest('[data-act]');
      if (e.target === dialog) { closeDialog(); return; }
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'close') closeDialog();
      else if (a === 'backup') {
        downloadBackup();
        dialog.querySelector('.data-note').textContent =
          'Backup file downloaded. Check your Downloads folder.';
      }
    });
    dialog.querySelector('[data-act="file"]').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) showRestore(file);
    });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
      if (e.key === 'Tab') {   // keep focus inside the dialog
        var f = Array.prototype.filter.call(
          dialog.querySelectorAll('button:not([disabled]), label.btn'),
          function (x) { return x.offsetParent !== null; });
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    dialog.querySelectorAll('label.btn').forEach(function (l) {
      l.tabIndex = 0;
      l.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input').click(); }
      });
    });
  }

  function showRestore(file) {
    var box = dialog.querySelector('.data-restore');
    box.hidden = false;
    box.className = 'data-restore';
    box.textContent = 'Reading the file…';

    readBackupFile(file).then(function (res) {
      var s = res.summary;
      var what = res.kind === 'full'
        ? 'Backup' + (s.owner ? ' of <strong>' + esc(s.owner) + '</strong>' : '') +
          (s.date ? ' from ' + esc(s.date) : '') + ': ' +
          s.blocks + ' schedule block' + (s.blocks === 1 ? '' : 's') + ', ' +
          s.records + ' past record' + (s.records === 1 ? '' : 's') + '.'
        : 'Schedule file: ' + s.blocks + ' block' + (s.blocks === 1 ? '' : 's') + '.';
      var warn = res.kind === 'full'
        ? 'This replaces everything currently saved in this browser.'
        : 'This replaces the weekly schedule currently saved in this browser.';
      box.innerHTML =
        '<p>' + what + '</p>' +
        '<p class="data-warn">' + warn + '</p>' +
        '<div class="data-restore-btns">' +
          '<button type="button" class="btn btn-primary data-btn" data-r="go">Restore</button>' +
          '<button type="button" class="btn btn-secondary data-btn" data-r="cancel">Cancel</button>' +
        '</div>';
      box.querySelector('[data-r="go"]').focus();
      box.querySelector('[data-r="go"]').addEventListener('click', function () {
        res.apply();
        try { sessionStorage.setItem(SS_RESTORED, res.kind === 'full'
          ? 'Your data has been restored from the backup file.'
          : 'Your weekly schedule has been restored.'); } catch (e) {}
        location.href = 'setup.html';
      });
      box.querySelector('[data-r="cancel"]').addEventListener('click', function () { box.hidden = true; });
    }, function () {
      box.className = 'data-restore is-error';
      box.textContent = 'This file can’t be opened here. Please choose a backup file made by this website ' +
        '(its name starts with “fdtr-backup”).';
    });
  }

  var lastFocus = null;
  function openDialog() {
    if (dialog) closeDialog();
    lastFocus = document.activeElement;
    buildDialog();
    document.body.appendChild(dialog);
    document.body.classList.add('data-modal-open');
    var first = dialog.querySelector('[data-act="backup"]:not([disabled])') || dialog.querySelector('label.btn');
    if (first) first.focus();
  }
  function closeDialog() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    document.body.classList.remove('data-modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Adds "Backup & restore" to the navbar on every page (left of Reset)
  function addNavButton() {
    var reset = document.querySelector('.nav-reset');
    if (!reset) return;
    var btn = el('<button type="button" class="nav-data" title="Back up your data or move it to another computer">' +
                 ICON_BACKUP + '<span>Backup &amp; restore</span></button>');
    btn.addEventListener('click', openDialog);
    reset.parentNode.insertBefore(btn, reset);
  }

  // ── Past records card (generate page) ──────────────────────────────────
  function renderHistory() {
    var card = document.getElementById('history-card');
    if (!card) return;
    var list = card.querySelector('.history-list');
    var h = getHistory();
    var count = document.getElementById('history-count');
    if (count) {
      count.textContent = h.length;
      count.classList.toggle('is-zero', !h.length);
    }

    if (!h.length) {
      list.innerHTML = '<p class="history-empty">Nothing here yet. Each FDTR you download is kept here ' +
        'so you can download it again later.</p>';
      renderBackupNote();
      return;
    }

    list.innerHTML = h.map(function (r) {
      return '<div class="history-row" data-id="' + esc(r.id) + '">' +
        '<div class="history-main">' +
          '<span class="history-month">' + MONTHS[r.month - 1] + ' ' + r.year + '</span>' +
          '<span class="history-meta">Downloaded ' + esc(niceDate(r.savedAt)) + '</span>' +
        '</div>' +
        '<div class="history-actions">' +
          '<button type="button" class="btn-sm" data-h="download">Download</button>' +
          '<button type="button" class="btn-sm" data-h="edit">Edit</button>' +
          '<button type="button" class="btn-sm btn-sm-danger" data-h="remove" aria-label="Remove ' +
            MONTHS[r.month - 1] + ' ' + r.year + ' from this list">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');
    renderBackupNote();
  }

  // Gentle reminder under the Preview button when past records aren't backed up yet
  function renderBackupNote() {
    var note = document.getElementById('gen-backup-note');
    if (!note) return;
    var h = getHistory();
    var last = get(LS_LAST_BACKUP);
    var newest = h.reduce(function (t, r) { return r.savedAt > t ? r.savedAt : t; }, '');
    var stale = h.length && (!last || newest > last);
    note.hidden = !stale;
    if (!stale) return;
    note.innerHTML = (last ? 'You have new records since your last backup (' + esc(niceDate(last)) + ').'
                           : 'You haven\u2019t made a backup yet.') +
      ' <button type="button" class="link-btn">Download backup</button>';
    note.querySelector('.link-btn').addEventListener('click', function () {
      downloadBackup();
      renderBackupNote();
      toast('Backup file downloaded. Check your Downloads folder.');
    });
  }

  // Ask the browser not to clear this site's data on its own (e.g. when the disk is low).
  // Firefox shows a permission prompt for this, which would confuse people, so skip it there.
  function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist || /firefox/i.test(navigator.userAgent)) return;
    if (!get('fdtr_profile') && !get('fdtr_schedule')) return;
    navigator.storage.persisted().then(function (yes) { if (!yes) navigator.storage.persist(); })
      .catch(function () {});
  }

  function initHistory() {
    var card = document.getElementById('history-card');
    if (!card) return;
    renderHistory();
    card.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-h]');
      if (!b) return;
      var row = b.closest('.history-row');
      var id = row.getAttribute('data-id');
      var action = b.getAttribute('data-h');

      if (action === 'download') {
        var label = b.textContent;
        b.disabled = true;
        b.textContent = 'Preparing…';
        downloadFromHistory(id).then(function () {
          b.disabled = false; b.textContent = label;
        }, function (err) {
          console.error(err);
          b.disabled = false; b.textContent = label;
          toast('Sorry, that download didn’t work. Please try again.');
        });
      } else if (action === 'edit') {
        // Switch the form to that month; its saved entries load automatically
        var parts = id.split('-');
        var m = document.getElementById('month'), y = document.getElementById('year');
        if (m && y) {
          y.value = String(parseInt(parts[0], 10));
          m.value = String(parseInt(parts[1], 10));
          y.dispatchEvent(new Event('change', { bubbles: true }));
          m.dispatchEvent(new Event('change', { bubbles: true }));
          window.scrollTo({ top: 0, behavior: 'smooth' });
          toast('Now editing ' + MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0] + '.');
        }
      } else if (action === 'remove') {
        removeHistory(id);
        renderHistory();
      }
    });
  }

  // ── Start ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    addNavButton();
    initHistory();
    requestPersistence();
    var note = null;
    try { note = sessionStorage.getItem(SS_RESTORED); sessionStorage.removeItem(SS_RESTORED); } catch (e) {}
    if (note) toast(note);
  });

  window.fdtrData = {
    recordHistory: recordHistory,
    getHistory: getHistory,
    openBackup: openDialog,
    refreshHistory: renderHistory,
    toast: toast,
    downloadBackup: downloadBackup
  };
})();
