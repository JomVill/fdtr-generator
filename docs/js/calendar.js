/* ============================================================
   FDTR Calendar Widget  —  Weekly Schedule
   v3.0: pointer events (mouse, pen, touch with press-and-hold),
         double-click / double-tap to add, block editor with
         categories, repeat-on-days, duplicate, undo, keyboard access
   ============================================================ */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────────────────
  var CAL_START  = 6 * 60;   // 6:00 AM in minutes from midnight
  var CAL_END    = 22 * 60;  // 10:00 PM
  var TOTAL_MIN  = CAL_END - CAL_START;        // 960 min = 16 hours
  var PX_PER_MIN = 0.75;                       // 0.75 px / minute → 45 px/hour
  var TOTAL_H    = TOTAL_MIN * PX_PER_MIN;     // 720 px
  var SNAP       = 15;                         // snap to 15-min intervals
  var MIN_DUR    = 30;                         // minimum block duration (min)
  var DEFAULT_DUR = 60;                        // double-click creates a 1-hour block
  var DRAG_THRESHOLD = 8;                      // px of mouse movement before a drag starts
  var LONG_PRESS = 350;                        // ms a finger must rest before a touch drag starts
  var TOUCH_SLOP = 10;                         // px a finger may wander before we treat it as a scroll
  var DOUBLE_TAP_MS = 350;
  var UNDO_MS = 7000;

  var DAYS      = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  var DAY_SHORT = {
    monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri',
    saturday:'Sat', sunday:'Sun'
  };
  var DAY_LONG = {
    monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday',
    friday:'Friday', saturday:'Saturday', sunday:'Sunday'
  };
  var DAY_INITIAL = {
    monday:'M', tuesday:'T', wednesday:'W', thursday:'Th', friday:'F', saturday:'Sa', sunday:'Su'
  };
  var WEEKEND_DAYS = { saturday: true, sunday: true };

  var CATEGORIES = {
    class:              {label:'Class',              bg:'#dbeafe',border:'#3b82f6',text:'#1e40af'},
    consultation:       {label:'Consultation',       bg:'#dcfce7',border:'#22c55e',text:'#166634'},
    related_activities: {label:'Related Activities', bg:'#fef9c3',border:'#ca8a04',text:'#713f12'},
    others:             {label:'Others (Adm.)',       bg:'#f1f5f9',border:'#94a3b8',text:'#334155'},
  };

  // ── State ────────────────────────────────────────────────────────────────
  var schedule = {};
  DAYS.forEach(function(d) { schedule[d] = []; });

  var idCounter = 0;
  function nextId() { return ++idCounter; }

  var lastTouchAt = 0;          // last touch pointerdown — lets us ignore the browser's own dblclick

  // ── Time helpers ─────────────────────────────────────────────────────────
  function minToY(m)  { return (m - CAL_START) * PX_PER_MIN; }
  function yToMin(y)  { return y / PX_PER_MIN + CAL_START; }
  function snap(m)    { return Math.round(m / SNAP) * SNAP; }

  function minToStr(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    return pad(h) + ':' + pad(mm);
  }
  function strToMin(s) {
    if (!s) return CAL_START;
    var parts = s.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  }
  function minTo12(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12 || 12;
    return h12 + ':' + pad(mm) + ' ' + ap;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function durLabel(dur) {
    var h = Math.floor(dur / 60), m = dur % 60;
    if (h > 0 && m > 0) return h + 'h ' + m + 'm';
    if (h > 0)          return h + 'h';
    return m + 'm';
  }

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Overlap layout (side-by-side columns) ────────────────────────────────
  // Returns [{block, col, totalCols}, ...] sorted by start
  function computeLayout(blocks) {
    if (!blocks.length) return [];

    var sorted = blocks.slice().sort(function(a, b) { return a.start - b.start; });
    var colEnds = [];   // tracks end time of the last block in each visual column

    var result = sorted.map(function(block) {
      // Find first column that has ended before this block starts
      var c = -1;
      for (var i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= block.start) { c = i; break; }
      }
      if (c === -1) { c = colEnds.length; colEnds.push(0); }
      colEnds[c] = block.end;
      return { block: block, col: c, totalCols: 1 };
    });

    // Second pass: set totalCols = max col index among overlapping peers + 1
    result.forEach(function(a) {
      var maxCol = a.col;
      result.forEach(function(b) {
        if (a.block.start < b.block.end && a.block.end > b.block.start) {
          maxCol = Math.max(maxCol, b.col);
        }
      });
      a.totalCols = maxCol + 1;
    });

    return result;
  }

  // ── Block data helpers ───────────────────────────────────────────────────
  // Blocks on other days with the same time, category and label count as repeats
  function sameBlock(a, b) {
    return a.start === b.start && a.end === b.end &&
           a.category === b.category && (a.label || '') === (b.label || '');
  }
  function sortDay(day) {
    schedule[day].sort(function(x, y) { return x.start - y.start; });
  }
  function addBlock(day, fields) {
    var b = { id: nextId(), start: fields.start, end: fields.end,
              category: fields.category || 'others', label: fields.label || '' };
    schedule[day].push(b);
    sortDay(day);
    return b;
  }
  function removeBlock(day, id) {
    schedule[day] = schedule[day].filter(function(b) { return b.id !== id; });
  }
  function findBlock(day, id) {
    for (var i = 0; i < schedule[day].length; i++) {
      if (schedule[day][i].id === id) return schedule[day][i];
    }
    return null;
  }
  function blockEl(day, id) {
    return document.querySelector('.cal-col-body[data-day="' + day + '"] .cal-block[data-id="' + id + '"]');
  }
  // Other days that hold an identical block
  function repeatDays(day, block) {
    return DAYS.filter(function(d) {
      return d !== day && schedule[d].some(function(b) { return sameBlock(b, block); });
    });
  }
  function dayList(days) {
    var names = days.map(function(d) { return DAY_LONG[d]; });
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  // ── Undo (snapshot of the whole week) ────────────────────────────────────
  function snapshot() {
    var s = {};
    DAYS.forEach(function(d) {
      s[d] = schedule[d].map(function(b) {
        return { start: b.start, end: b.end, category: b.category, label: b.label };
      });
    });
    return s;
  }
  function restore(snap) {
    closePopover();
    DAYS.forEach(function(d) {
      schedule[d] = (snap[d] || []).map(function(b) {
        return { id: nextId(), start: b.start, end: b.end, category: b.category, label: b.label };
      });
      renderDay(d);
    });
    serialize();
  }

  var toastEl = null, toastTimer = null;
  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) { toastEl.remove(); toastEl = null; }
  }
  // Short message at the bottom of the screen, optionally with an Undo button
  function showToast(message, undoSnap) {
    hideToast();
    toastEl = document.createElement('div');
    toastEl.className = 'cal-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = '<span class="cal-toast-msg"></span>' +
      (undoSnap ? '<button type="button" class="cal-toast-undo">Undo</button>' : '') +
      '<button type="button" class="cal-toast-close" aria-label="Dismiss">' + ICON_CLOSE + '</button>';
    toastEl.querySelector('.cal-toast-msg').textContent = message;
    document.body.appendChild(toastEl);

    if (undoSnap) {
      toastEl.querySelector('.cal-toast-undo').addEventListener('click', function() {
        restore(undoSnap);
        showToast('Change undone.');
      });
    }
    toastEl.querySelector('.cal-toast-close').addEventListener('click', hideToast);
    toastTimer = setTimeout(hideToast, UNDO_MS);
  }

  // ── Icons ────────────────────────────────────────────────────────────────
  var ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/>' +
    '<line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  var ICON_COPY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var ICON_CAL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>' +
    '<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  // ── Pointer gestures (mouse, pen and touch) ──────────────────────────────
  // Mouse/pen: a drag starts after a few pixels of movement.
  // Touch: the finger must rest for LONG_PRESS ms first; moving earlier means
  // the person is scrolling the page, so we let the browser have it.
  // opts: { onStart(ev), onMove(ev), onEnd(ev), onTap(ev), immediate }
  function trackPointer(e, opts) {
    var touch  = e.pointerType === 'touch';
    var id     = e.pointerId;
    var sx = e.clientX, sy = e.clientY;
    var active = false, timer = null, last = e;

    function begin(ev) {
      active = true;
      var ua = navigator.userActivation;
      if (touch && navigator.vibrate && (!ua || ua.hasBeenActive)) { try { navigator.vibrate(8); } catch (x) {} }
      if (opts.onStart) opts.onStart(ev);
    }
    function onMove(ev) {
      if (ev.pointerId !== id) return;
      last = ev;
      if (!active) {
        var d = Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy);
        if (touch) { if (d > TOUCH_SLOP) cleanup(); return; }   // it's a scroll
        if (d < DRAG_THRESHOLD) return;
        begin(ev);
      }
      if (opts.onMove) opts.onMove(ev);
    }
    function onUp(ev) {
      if (ev.pointerId !== id) return;
      var wasActive = active;
      cleanup();
      if (wasActive) { if (opts.onEnd) opts.onEnd(ev.type === 'pointercancel' ? last : ev); }
      else if (ev.type === 'pointerup' && opts.onTap) opts.onTap(ev);
    }
    // While a touch drag is active, stop the page from scrolling under the finger
    function blockScroll(te) { if (active) te.preventDefault(); }
    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('touchmove', blockScroll, { passive: false });
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('touchmove', blockScroll, { passive: false });

    if (opts.immediate)  begin(e);
    else if (touch)      timer = setTimeout(function() { begin(last); }, LONG_PRESS);
  }

  // ── Popover (block editor) ───────────────────────────────────────────────
  var activePopover = null;
  var activeAnchor  = null;    // { day, id } of the block being edited

  function duplicateBlock(day, block) {
    var undo = snapshot();
    var dur = block.end - block.start, start;
    // Copy on the same day, right after the original (else right before, else on top of it)
    if (block.end + dur <= CAL_END)          start = block.end;
    else if (block.start - dur >= CAL_START) start = block.start - dur;
    else                                     start = block.start;
    var copy = addBlock(day, { start: start, end: start + dur,
                               category: block.category, label: block.label });
    renderDay(day);
    serialize();
    var el = blockEl(day, copy.id);
    if (el) {
      el.classList.add('cal-block-new');
      showPopover(el, day, copy.id);
    }
    showToast('Copy added at ' + minTo12(copy.start) + '.', undo);
  }

  // opts.focusLabel: put the cursor in the label field (used right after creating a block)
  function showPopover(anchorEl, day, blockId, opts) {
    closePopover(false);
    var block = findBlock(day, blockId);
    if (!block) return;
    opts = opts || {};

    var pop = document.createElement('div');
    pop.className = 'cal-popover';
    pop.tabIndex  = -1;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Edit ' + DAY_LONG[day] + ' time block');

    var chips = Object.keys(CATEGORIES).map(function(k) {
      var c = CATEGORIES[k];
      return '<label class="pop-chip" style="--chip-bg:' + c.bg + ';--chip-border:' + c.border +
               ';--chip-text:' + c.text + '">' +
               '<input type="radio" name="pop-cat" value="' + k + '"' +
                 (block.category === k ? ' checked' : '') + '/>' +
               '<span class="pop-chip-dot"></span>' + c.label +
             '</label>';
    }).join('');

    var range = ' min="' + minToStr(CAL_START) + '" max="' + minToStr(CAL_END) + '" step="900"';

    // Repeat toggles: this day is fixed on; other days are on where an identical block exists.
    // Hidden weekend days are left out unless they already hold a copy.
    var dayToggles = DAYS.map(function(d) {
      var on = d === day || schedule[d].some(function(b) { return sameBlock(b, block); });
      if (WEEKEND_DAYS[d] && !showWeekends && !on) return '';
      return '<label class="pop-day' + (d === day ? ' is-current' : '') + '" title="' + DAY_LONG[d] + '">' +
               '<input type="checkbox" value="' + d + '"' + (on ? ' checked' : '') +
                 (d === day ? ' disabled' : '') + ' aria-label="' + DAY_LONG[d] + '"/>' +
               DAY_INITIAL[d] +
             '</label>';
    }).join('');

    pop.innerHTML =
      '<div class="pop-head">' +
        '<span class="pop-accent"></span>' +
        '<input class="pop-title" id="pop-lbl" type="text" maxlength="40" autocomplete="off"' +
          ' value="' + escHtml(block.label) + '" placeholder="Add a name, e.g. CS 101"' +
          ' aria-label="Name (optional), for example the subject code"/>' +
        '<button type="button" class="pop-close" aria-label="Close without saving">' + ICON_CLOSE + '</button>' +
      '</div>' +
      '<div class="pop-body">' +
        '<div class="pop-meta"><span>' + DAY_LONG[day] + '</span>' +
          '<span class="pop-meta-dot" aria-hidden="true"></span><span class="pop-dur"></span></div>' +
        '<div class="pop-times">' +
          '<input class="pop-time-input" id="pop-start" type="time"' + range +
            ' value="' + minToStr(block.start) + '" aria-label="Start time"/>' +
          '<span class="pop-time-sep" aria-hidden="true">to</span>' +
          '<input class="pop-time-input" id="pop-end" type="time"' + range +
            ' value="' + minToStr(block.end) + '" aria-label="End time"/>' +
        '</div>' +
        '<div class="pop-err" id="pop-err" role="alert" hidden></div>' +
        '<div class="pop-label" id="pop-cat-label">What is it?</div>' +
        '<div class="pop-chips" role="radiogroup" aria-labelledby="pop-cat-label">' + chips + '</div>' +
        '<div class="pop-label" id="pop-rep-label">Same time on other days</div>' +
        '<div class="pop-days" role="group" aria-labelledby="pop-rep-label">' + dayToggles + '</div>' +
      '</div>' +
      '<div class="pop-footer">' +
        '<div class="pop-footer-left">' +
          '<button type="button" class="btn-pop-danger">' + ICON_TRASH + 'Delete</button>' +
          '<button type="button" class="btn-pop-ghost" title="Make a copy right after this one (Ctrl/⌘ + D)">' +
            ICON_COPY + 'Copy</button>' +
        '</div>' +
        '<button type="button" class="btn-pop-primary">Save</button>' +
      '</div>' +
      // Shown instead of the footer when deleting a block that repeats on other days
      '<div class="pop-confirm" hidden>' +
        '<p class="pop-confirm-q"></p>' +
        '<div class="pop-confirm-btns">' +
          '<button type="button" class="btn-pop-outline" data-del="one"></button>' +
          '<button type="button" class="btn-pop-danger-solid" data-del="all"></button>' +
        '</div>' +
        '<button type="button" class="btn-pop-link" data-del="cancel">Keep it</button>' +
      '</div>';

    document.body.appendChild(pop);
    activePopover = pop;
    activeAnchor  = { day: day, id: blockId };
    positionPopover(pop, anchorEl);

    var startEl = pop.querySelector('#pop-start');
    var endEl   = pop.querySelector('#pop-end');
    var errEl   = pop.querySelector('#pop-err');
    var lblEl   = pop.querySelector('#pop-lbl');

    function selectedCat() {
      var r = pop.querySelector('input[name="pop-cat"]:checked');
      return r ? r.value : 'others';
    }
    // Accent bar, duration and selected states follow the current (unsaved) choices.
    // Selected state is a class (not :has) so it shows in older browsers too.
    function refresh() {
      var c = CATEGORIES[selectedCat()] || CATEGORIES.others;
      pop.style.setProperty('--pop-accent', c.border);
      var d = strToMin(endEl.value) - strToMin(startEl.value);
      pop.querySelector('.pop-dur').textContent = d > 0 ? durLabel(d) : '—';
      pop.querySelectorAll('.pop-chip, .pop-day').forEach(function(l) {
        l.classList.toggle('is-checked', l.querySelector('input').checked);
      });
    }
    function clearErr() {
      startEl.classList.remove('is-invalid');
      endEl.classList.remove('is-invalid');
      errEl.hidden = true;
    }
    function showErr(msg, els) {
      els.forEach(function(el) { el.classList.add('is-invalid'); });
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    refresh();

    [startEl, endEl].forEach(function(inp) {
      inp.addEventListener('input',  function() { clearErr(); refresh(); });
      inp.addEventListener('change', function() { clearErr(); refresh(); });
    });
    pop.querySelectorAll('.pop-chip input, .pop-day input').forEach(function(r) {
      r.addEventListener('change', refresh);
    });

    function save() {
      var newStart = strToMin(startEl.value);
      var newEnd   = strToMin(endEl.value);

      if (!startEl.value || !endEl.value) {
        showErr('Please enter both a start and an end time.', [startEl, endEl]); return;
      }
      if (newStart < CAL_START || newEnd > CAL_END) {
        showErr('Please choose times between 6:00 AM and 10:00 PM.', [startEl, endEl]); return;
      }
      if (newEnd <= newStart) {
        showErr('The end time needs to be later than the start time.', [startEl, endEl]); return;
      }
      if (newEnd - newStart < MIN_DUR) {
        showErr('A time block needs to be at least ' + MIN_DUR + ' minutes long.', [endEl]); return;
      }

      // Clamp to calendar bounds
      newStart = Math.max(CAL_START, Math.min(CAL_END - MIN_DUR, snap(newStart)));
      newEnd   = Math.max(newStart + MIN_DUR, Math.min(CAL_END, snap(newEnd)));

      var undo   = snapshot();
      var before = { start: block.start, end: block.end, category: block.category, label: block.label };
      var after  = { start: newStart, end: newEnd, category: selectedCat(), label: lblEl.value.trim() };

      // Overlaps are allowed — just set the time
      block.start    = after.start;
      block.end      = after.end;
      block.category = after.category;
      block.label    = after.label;
      sortDay(day);
      renderDay(day);

      // Other days: update copies on checked days (or add them); remove copies from unchecked days
      var added = [], removed = [];
      pop.querySelectorAll('.pop-day input:not(:disabled)').forEach(function(cb) {
        var d = cb.value;
        var copies = schedule[d].filter(function(b) { return sameBlock(b, before); });
        if (cb.checked) {
          if (copies.length) {
            copies.forEach(function(b) {
              b.start = after.start; b.end = after.end; b.category = after.category; b.label = after.label;
            });
            sortDay(d);
          } else if (!schedule[d].some(function(b) { return sameBlock(b, after); })) {
            addBlock(d, after);
            added.push(d);
          }
        } else if (copies.length) {
          schedule[d] = schedule[d].filter(function(b) { return !sameBlock(b, before); });
          removed.push(d);
        }
        renderDay(d);
      });

      serialize();
      closePopover(true);

      if (removed.length) showToast('Removed from ' + dayList(removed) + '.', undo);
      else if (added.length) showToast('Also added to ' + dayList(added) + '.', undo);
    }

    function deleteBlocks(all) {
      var undo  = snapshot();
      var days  = all ? repeatDays(day, block) : [];
      var label = block.label || (CATEGORIES[block.category] || CATEGORIES.others).label;
      removeBlock(day, blockId);
      renderDay(day);
      days.forEach(function(d) {
        schedule[d] = schedule[d].filter(function(b) { return !sameBlock(b, block); });
        renderDay(d);
      });
      serialize();
      closePopover(false);
      showToast(all ? '“' + label + '” deleted from ' + (days.length + 1) + ' days.'
                    : '“' + label + '” deleted.', undo);
    }

    pop.querySelector('.pop-close').addEventListener('click', function() { closePopover(true); });
    pop.querySelector('.btn-pop-primary').addEventListener('click', save);
    pop.querySelector('.btn-pop-ghost').addEventListener('click', function() {
      closePopover(false);
      duplicateBlock(day, block);
    });

    // Delete: ask "this day or all days?" only when the block repeats elsewhere
    var footer  = pop.querySelector('.pop-footer');
    var confirm = pop.querySelector('.pop-confirm');
    pop.querySelector('.btn-pop-danger').addEventListener('click', function() {
      var others = repeatDays(day, block);
      if (!others.length) { deleteBlocks(false); return; }
      confirm.querySelector('.pop-confirm-q').textContent =
        'This block is also on ' + dayList(others) + '. Delete it from:';
      confirm.querySelector('[data-del="one"]').textContent = DAY_LONG[day] + ' only';
      confirm.querySelector('[data-del="all"]').textContent = 'All ' + (others.length + 1) + ' days';
      footer.hidden  = true;
      confirm.hidden = false;
      confirm.querySelector('[data-del="one"]').focus();
      positionPopover(pop, blockEl(day, blockId) || anchorEl);
    });
    confirm.addEventListener('click', function(e) {
      var which = e.target.getAttribute && e.target.getAttribute('data-del');
      if (which === 'one') deleteBlocks(false);
      else if (which === 'all') deleteBlocks(true);
      else if (which === 'cancel') {
        confirm.hidden = true;
        footer.hidden  = false;
        pop.querySelector('.btn-pop-danger').focus();
      }
    });

    // Enter in a text/time field saves; Esc closes without saving; Ctrl/⌘+D copies
    pop.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); closePopover(true); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        closePopover(false);
        duplicateBlock(day, block);
      }
      else if (e.key === 'Enter' && (e.target.type === 'text' || e.target.type === 'time')) {
        e.preventDefault();
        save();
      }
    });

    // Focus moves into the editor so the keyboard works right away
    if (opts.focusLabel) lblEl.focus({ preventScroll: true });
    else                 pop.focus({ preventScroll: true });

    window.addEventListener('scroll', repositionPopover, { passive: true });
    window.addEventListener('resize', repositionPopover);
    setTimeout(function() {
      document.addEventListener('pointerdown', onOutsideClick);
    }, 10);
  }

  function onOutsideClick(e) {
    if (!activePopover || activePopover.contains(e.target)) return;
    if (toastEl && toastEl.contains(e.target)) return;
    closePopover(false);
  }

  // restoreFocus: put keyboard focus back on the block that was being edited
  function closePopover(restoreFocus) {
    var anchor = activeAnchor;
    if (activePopover) { activePopover.remove(); activePopover = null; }
    activeAnchor = null;
    document.removeEventListener('pointerdown', onOutsideClick);
    window.removeEventListener('scroll', repositionPopover);
    window.removeEventListener('resize', repositionPopover);
    if (restoreFocus && anchor) {
      var el = blockEl(anchor.day, anchor.id);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // Keep the editor next to its block while the page scrolls
  function repositionPopover() {
    if (!activePopover || !activeAnchor) return;
    var el = blockEl(activeAnchor.day, activeAnchor.id);
    if (!el) { closePopover(false); return; }
    positionPopover(activePopover, el);
  }

  function positionPopover(pop, anchorEl) {
    var rect  = anchorEl.getBoundingClientRect();
    var pw    = pop.offsetWidth;
    var ph    = pop.offsetHeight;
    var gap   = 12;
    var vw    = document.documentElement.clientWidth;
    var vh    = document.documentElement.clientHeight;
    var left, top;

    if (rect.right + gap + pw <= vw - 8) {          // right of block
      left = rect.right + gap;
      top  = rect.top;
    } else if (rect.left - gap - pw >= 8) {         // left of block
      left = rect.left - gap - pw;
      top  = rect.top;
    } else {                                        // narrow screen: below, else above
      left = rect.left + (rect.width - pw) / 2;
      top  = (rect.bottom + gap + ph <= vh - 8) ? rect.bottom + gap : rect.top - gap - ph;
    }

    left = Math.max(8, Math.min(left, vw - pw - 8));
    top  = Math.max(8, Math.min(top,  vh - ph - 8));

    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  // ── Render a single block element ────────────────────────────────────────
  // colIdx / totalCols come from computeLayout for side-by-side overlap display
  function makeBlockEl(day, block, colIdx, totalCols) {
    colIdx    = (colIdx    == null) ? 0 : colIdx;
    totalCols = (totalCols == null) ? 1 : totalCols;

    var cat   = CATEGORIES[block.category] || CATEGORIES.others;
    var topPx = minToY(block.start);
    var htPx  = (block.end - block.start) * PX_PER_MIN;
    var dur   = block.end - block.start;
    var lbl   = block.label ? ' · ' + block.label : '';

    // Side-by-side column positioning using CSS calc()
    var pctL  = (colIdx / totalCols * 100).toFixed(2);
    var pctR  = ((totalCols - colIdx - 1) / totalCols * 100).toFixed(2);
    var edgeL = (colIdx === 0)           ? 2 : 1;
    var edgeR = (colIdx === totalCols-1) ? 2 : 1;

    var el = document.createElement('div');
    el.className = 'cal-block';
    el.dataset.id  = block.id;
    el.dataset.day = day;
    el.tabIndex    = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label',
      cat.label + (block.label ? ', ' + block.label : '') + ', ' + DAY_LONG[day] + ', ' +
      minTo12(block.start) + ' to ' + minTo12(block.end) + '. Press Enter to edit.');
    el.style.cssText =
      'top:'               + topPx      + 'px;'               +
      'height:'            + htPx       + 'px;'               +
      'left:calc('         + pctL       + '% + ' + edgeL + 'px);' +
      'right:calc('        + pctR       + '% + ' + edgeR + 'px);' +
      'background:'        + cat.bg     + ';'                 +
      'border-left-color:' + cat.border + ';'                 +
      'color:'             + cat.text   + ';';

    var timeStr = minTo12(block.start) + ' – ' + minTo12(block.end) + ' · ' + durLabel(dur);

    el.innerHTML =
      '<div class="cal-block-content">' +
        '<div class="cal-block-cat">'  + escHtml(cat.label + lbl) + '</div>' +
        (dur >= 45 ? '<div class="cal-block-time">' + timeStr + '</div>' : '') +
      '</div>' +
      '<div class="cal-block-resize" aria-hidden="true"></div>';

    function updateTimeText() {
      var timeEl = el.querySelector('.cal-block-time');
      if (timeEl) {
        timeEl.textContent = minTo12(block.start) + ' – ' + minTo12(block.end) +
                             ' · ' + durLabel(block.end - block.start);
      }
    }

    // Keyboard: Enter/Space opens the editor, Delete/Backspace removes (with undo)
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showPopover(el, day, block.id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        var undo = snapshot();
        removeBlock(day, block.id);
        renderDay(day);
        serialize();
        showToast('“' + (block.label || cat.label) + '” deleted.', undo);
      }
    });

    // ── Move (drag the block) + tap/click to edit ──────────────────────────
    el.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      if (e.target.classList.contains('cal-block-resize')) return;
      e.stopPropagation();
      if (e.pointerType === 'touch') lastTouchAt = Date.now();
      else e.preventDefault();

      var colBody   = el.closest('.cal-col-body');
      var blockDur  = block.end - block.start;
      var origStart = block.start;
      var undo      = null;
      var copyId    = null;
      var dragOffset = 0;

      trackPointer(e, {
        onStart: function(ev) {
          closePopover(false);
          undo = snapshot();
          dragOffset = (e.clientY - colBody.getBoundingClientRect().top) - minToY(block.start);
          el.classList.add('cal-block-dragging');
          // Alt/Option-drag duplicates: the copy stays put, the original moves
          if (e.altKey || ev.altKey) {
            copyId = addBlock(day, block).id;
            var ghost = el.cloneNode(true);
            ghost.classList.remove('cal-block-dragging');
            colBody.insertBefore(ghost, el);
          }
        },
        onMove: function(ev) {
          var relY     = ev.clientY - colBody.getBoundingClientRect().top;
          var newStart = snap(Math.round(yToMin(relY - dragOffset)));
          newStart = Math.max(CAL_START, Math.min(CAL_END - blockDur, newStart));
          // Overlaps are allowed — always update position
          block.start = newStart;
          block.end   = newStart + blockDur;
          el.style.top = minToY(newStart) + 'px';
          updateTimeText();
        },
        onEnd: function() {
          el.classList.remove('cal-block-dragging');
          // Alt-drag that ended where it started would leave two identical blocks stacked
          if (copyId && block.start === origStart) removeBlock(day, copyId);
          sortDay(day);
          renderDay(day);
          serialize();
          if (copyId && block.start !== origStart) showToast('Copy made.', undo);
        },
        onTap: function() {
          showPopover(el, day, block.id);
        }
      });
    });

    // ── Resize (drag the bottom edge) — starts immediately, even on touch ──
    var rHandle = el.querySelector('.cal-block-resize');
    rHandle.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      closePopover(false);
      var colBody = el.closest('.cal-col-body');

      trackPointer(e, {
        immediate: true,
        onMove: function(ev) {
          var relY   = ev.clientY - colBody.getBoundingClientRect().top;
          var newEnd = snap(Math.round(yToMin(relY)));
          // Overlaps allowed — always resize
          block.end = Math.max(block.start + MIN_DUR, Math.min(CAL_END, newEnd));
          el.style.height = ((block.end - block.start) * PX_PER_MIN) + 'px';
          updateTimeText();
        },
        onEnd: function() {
          renderDay(day);
          serialize();
        }
      });
    });

    return el;
  }

  // ── Render all blocks for a day (with overlap layout) ───────────────────
  function renderDay(day) {
    var colBody = document.querySelector('.cal-col-body[data-day="' + day + '"]');
    if (!colBody) return;

    colBody.querySelectorAll('.cal-block').forEach(function(b) { b.remove(); });

    var layout = computeLayout(schedule[day]);
    layout.forEach(function(item) {
      colBody.appendChild(makeBlockEl(day, item.block, item.col, item.totalCols));
    });
    serialize();
  }

  // ── Add blocks: drag down an empty column, or double-click / double-tap ──
  // focusLabel is off for touch so the phone keyboard doesn't cover the new block
  function createAt(colBody, day, clientY, focusLabel) {
    var relY  = clientY - colBody.getBoundingClientRect().top;
    var start = Math.floor(yToMin(relY) / SNAP) * SNAP;            // the slot that was clicked
    start = Math.max(CAL_START, Math.min(CAL_END - DEFAULT_DUR, start));
    var block = addBlock(day, { start: start, end: start + DEFAULT_DUR, category: 'others', label: '' });
    renderDay(day);
    serialize();
    var el = blockEl(day, block.id);
    if (el) {
      el.classList.add('cal-block-new');
      showPopover(el, day, block.id, { focusLabel: focusLabel });
    }
  }

  function initColDrag(colBody, day) {
    var lastTap = { t: 0, y: 0 };

    colBody.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.cal-block')) return;
      if (e.pointerType === 'touch') lastTouchAt = Date.now();
      else e.preventDefault();

      var phantom   = null;
      var dragStart = null;

      trackPointer(e, {
        onStart: function() {
          closePopover(false);
          // Base the block start on where the pointer was PRESSED (not current pos)
          var relY  = e.clientY - colBody.getBoundingClientRect().top;
          dragStart = snap(Math.round(yToMin(relY)));
          dragStart = Math.max(CAL_START, Math.min(CAL_END - MIN_DUR, dragStart));

          phantom               = document.createElement('div');
          phantom.className     = 'cal-phantom';
          phantom.style.top     = minToY(dragStart) + 'px';
          phantom.style.height  = (MIN_DUR * PX_PER_MIN) + 'px';
          colBody.appendChild(phantom);
        },
        onMove: function(ev) {
          var y   = ev.clientY - colBody.getBoundingClientRect().top;
          var cur = snap(Math.round(yToMin(y)));
          var end = Math.max(dragStart + MIN_DUR, Math.min(CAL_END, cur));
          phantom.style.height = ((end - dragStart) * PX_PER_MIN) + 'px';
        },
        onEnd: function(ev) {
          if (phantom) phantom.remove();
          var y   = ev.clientY - colBody.getBoundingClientRect().top;
          var end = snap(Math.round(yToMin(y)));
          end = Math.max(dragStart + MIN_DUR, Math.min(CAL_END, end));
          // Overlaps are allowed — always create
          var block = addBlock(day, { start: dragStart, end: end, category: 'others', label: '' });
          renderDay(day);
          serialize();
          var el = blockEl(day, block.id);
          if (el) showPopover(el, day, block.id, { focusLabel: e.pointerType !== 'touch' });
        },
        // Double-tap on a touchscreen (mouse double-clicks use the dblclick event below)
        onTap: function(ev) {
          if (ev.pointerType !== 'touch') { closePopover(false); return; }
          var now = Date.now();
          if (now - lastTap.t < DOUBLE_TAP_MS && Math.abs(ev.clientY - lastTap.y) < 30) {
            lastTap.t = 0;
            createAt(colBody, day, ev.clientY, false);
          } else {
            lastTap = { t: now, y: ev.clientY };
            closePopover(false);
          }
        }
      });
    });

    // Long-press on touch would open the browser's context menu — not wanted here
    colBody.addEventListener('contextmenu', function(e) {
      if (Date.now() - lastTouchAt < 1500) e.preventDefault();
    });

    // Double-click on empty space → 1-hour block at that slot, editor open (Notion Calendar style)
    colBody.addEventListener('dblclick', function(e) {
      if (e.target.closest && e.target.closest('.cal-block')) return;
      if (Date.now() - lastTouchAt < 800) return;     // the touch handler already did it
      e.preventDefault();
      createAt(colBody, day, e.clientY, true);
    });
  }

  // ── Build DOM ────────────────────────────────────────────────────────────
  function build(containerEl) {
    loadWeekendPref();

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'cal-toolbar';
    var toggleBtn = document.createElement('button');
    toggleBtn.type      = 'button';
    toggleBtn.className = 'cal-weekend-toggle';
    updateToggleLabel(toggleBtn);
    toolbar.appendChild(toggleBtn);

    // Header row
    var header = document.createElement('div');
    header.className = 'cal-header-row';
    header.innerHTML = '<div class="cal-header-spacer"></div>';
    DAYS.forEach(function(d) {
      var hd = document.createElement('div');
      hd.className = 'cal-day-header' + (WEEKEND_DAYS[d] ? ' cal-day-header-weekend' : '');
      hd.textContent = DAY_SHORT[d];
      header.appendChild(hd);
    });

    // Body (no overflow — page scrolls naturally)
    var scrollBody = document.createElement('div');
    scrollBody.className = 'cal-scroll-body';

    // Time axis
    var timeAxis = document.createElement('div');
    timeAxis.className = 'cal-time-axis';
    timeAxis.style.height = TOTAL_H + 'px';
    for (var m = CAL_START; m <= CAL_END; m += 60) {
      var lbl = document.createElement('div');
      lbl.className   = 'cal-time-label';
      lbl.style.top   = minToY(m) + 'px';
      lbl.textContent = minTo12(m).replace(':00 ', ' ');
      timeAxis.appendChild(lbl);
    }
    scrollBody.appendChild(timeAxis);

    // Day columns
    var colsWrap = document.createElement('div');
    colsWrap.className = 'cal-cols-wrapper';

    DAYS.forEach(function(day) {
      var col = document.createElement('div');
      col.className = 'cal-col' + (WEEKEND_DAYS[day] ? ' cal-col-weekend' : '');

      var colBody = document.createElement('div');
      colBody.className   = 'cal-col-body';
      colBody.dataset.day = day;
      colBody.style.height = TOTAL_H + 'px';

      for (var min = CAL_START; min <= CAL_END; min += 30) {
        var line = document.createElement('div');
        line.className = (min % 60 === 0) ? 'cal-hour-line' : 'cal-half-line';
        line.style.top = minToY(min) + 'px';
        colBody.appendChild(line);
      }

      initColDrag(colBody, day);
      col.appendChild(colBody);
      colsWrap.appendChild(col);
    });

    scrollBody.appendChild(colsWrap);

    // Assemble
    var outer = document.createElement('div');
    outer.className = 'cal-outer';
    outer.appendChild(toolbar);
    outer.appendChild(header);
    outer.appendChild(scrollBody);
    containerEl.appendChild(outer);

    toggleBtn.addEventListener('click', function() {
      showWeekends = !showWeekends;
      try { localStorage.setItem(LS_WEEKENDS, showWeekends ? 'true' : 'false'); } catch(e) {}
      applyWeekendPref(outer);
      updateToggleLabel(toggleBtn);
      closePopover(false);
    });

    applyWeekendPref(outer);
  }

  // ── Serialize to hidden input + localStorage ─────────────────────────────
  function serialize() {
    var result = {};
    DAYS.forEach(function(day) {
      result[day] = schedule[day].map(function(b) {
        return { time_in: minToStr(b.start), time_out: minToStr(b.end),
                 category: b.category, label: b.label };
      });
    });
    var json = JSON.stringify(result);
    var inp  = document.getElementById('schedule-json');
    if (inp) inp.value = json;
    try { localStorage.setItem('fdtr_schedule', json); } catch(e) {}
  }

  // ── Load from data object ─────────────────────────────────────────────────
  // opts.undoMessage: show an Undo toast so a mistaken load can be reversed
  function load(data, opts) {
    var undo = (opts && opts.undoMessage) ? snapshot() : null;
    closePopover(false);
    DAYS.forEach(function(day) {
      schedule[day] = [];
      var slots = (data && data[day]) || [];
      slots.forEach(function(s) {
        var st = strToMin(s.time_in);
        var en = strToMin(s.time_out);
        if (st >= CAL_START && en <= CAL_END && en > st) {
          schedule[day].push({
            id: nextId(), start: st, end: en,
            category: s.category || 'others', label: s.label || '',
          });
        }
      });
      sortDay(day);
      renderDay(day);
    });
    serialize();
    if (undo) showToast(opts.undoMessage, undo);
  }

  // ── Weekend visibility ────────────────────────────────────────────────────
  var LS_WEEKENDS  = 'fdtr_show_weekends';
  var showWeekends = true;

  function loadWeekendPref() {
    try { var v = localStorage.getItem(LS_WEEKENDS); if (v === 'false') showWeekends = false; } catch(e) {}
  }

  function applyWeekendPref(el) {
    el.classList.toggle('cal-hide-weekends', !showWeekends);
  }

  function updateToggleLabel(btn) {
    btn.innerHTML = ICON_CAL + (showWeekends ? 'Hide Sat & Sun' : 'Show Sat & Sun');
    btn.setAttribute('aria-pressed', showWeekends ? 'true' : 'false');
  }

  // ── Legend ────────────────────────────────────────────────────────────────
  function buildLegend(containerEl) {
    var wrap = document.createElement('div');
    wrap.className = 'cal-legend';
    Object.keys(CATEGORIES).forEach(function(k) {
      var c    = CATEGORIES[k];
      var item = document.createElement('div');
      item.className = 'cal-legend-item';
      item.innerHTML =
        '<div class="cal-legend-dot" style="background:' + c.bg +
        ';border:2px solid ' + c.border + '"></div><span>' + c.label + '</span>';
      wrap.appendChild(item);
    });
    containerEl.appendChild(wrap);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.calendarWidget = {
    build: function(containerEl, initialData) {
      build(containerEl);
      buildLegend(containerEl);
      if (initialData) { load(initialData); } else { serialize(); }
    },
    load:        load,
    save:        serialize,
    getSchedule: function() {
      var result = {};
      DAYS.forEach(function(day) {
        result[day] = schedule[day].map(function(b) {
          return { time_in: minToStr(b.start), time_out: minToStr(b.end),
                   category: b.category, label: b.label };
        });
      });
      return result;
    },
    clear: function() {
      DAYS.forEach(function(day) { schedule[day] = []; renderDay(day); });
      serialize();
    },
  };

})();
