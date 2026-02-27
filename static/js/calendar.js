/* ============================================================
   FDTR Calendar Widget  —  Drag-to-Create Weekly Schedule
   Notion / Google Calendar style, vanilla JS
   v2.2: coordinate bug fixed, manual time inputs in popover
   ============================================================ */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────────────────
  var CAL_START  = 6 * 60;   // 6:00 AM in minutes from midnight
  var CAL_END    = 22 * 60;  // 10:00 PM
  var TOTAL_MIN  = CAL_END - CAL_START;        // 960 min = 16 hours
  var PX_PER_MIN = 1.0;                        // 1 px / minute → 60 px/hour
  var TOTAL_H    = TOTAL_MIN * PX_PER_MIN;     // 960 px
  var SNAP       = 15;                         // snap to 15-min intervals
  var MIN_DUR    = 30;                         // minimum block duration (min)

  var DAYS      = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  var DAY_SHORT = {
    monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri',
    saturday:'Sat', sunday:'Sun'
  };
  var WEEKEND_DAYS = { saturday: true, sunday: true };

  var CATEGORIES = {
    class:              {label:'Class',              bg:'#dbeafe',border:'#3b82f6',text:'#1e40af'},
    consultation:       {label:'Consultation',       bg:'#dcfce7',border:'#22c55e',text:'#166534'},
    related_activities: {label:'Related Activities', bg:'#fef9c3',border:'#ca8a04',text:'#713f12'},
    others:             {label:'Others (Adm.)',       bg:'#f1f5f9',border:'#94a3b8',text:'#334155'},
  };

  // ── State ────────────────────────────────────────────────────────────────
  var schedule = {};
  DAYS.forEach(function(d) { schedule[d] = []; });

  var idCounter = 0;
  function nextId() { return ++idCounter; }

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

  // Duration label  e.g. 60→"1h", 90→"1h 30m", 45→"45m"
  function durLabel(dur) {
    var h = Math.floor(dur / 60), m = dur % 60;
    if (h > 0 && m > 0) return h + 'h ' + m + 'm';
    if (h > 0)          return h + 'h';
    return m + 'm';
  }

  // ── Overlap detection ────────────────────────────────────────────────────
  function overlaps(day, start, end, excludeId) {
    return schedule[day].some(function(b) {
      if (b.id === excludeId) return false;
      return start < b.end && end > b.start;
    });
  }

  // ── Popover ──────────────────────────────────────────────────────────────
  var activePopover = null;

  function showPopover(blockEl, day, blockId) {
    closePopover();
    var block = findBlock(day, blockId);
    if (!block) return;

    var pop = document.createElement('div');
    pop.className = 'cal-popover';

    var catOpts = Object.keys(CATEGORIES).map(function(k) {
      return '<option value="' + k + '"' +
             (block.category === k ? ' selected' : '') + '>' +
             CATEGORIES[k].label + '</option>';
    }).join('');

    pop.innerHTML =
      '<div class="pop-header">' +
        '<div class="pop-times">' +
          '<input class="pop-time-input" id="pop-start" type="time" value="' + minToStr(block.start) + '"/>' +
          '<span class="pop-time-sep">\u2013</span>' +
          '<input class="pop-time-input" id="pop-end"   type="time" value="' + minToStr(block.end)   + '"/>' +
        '</div>' +
        '<button class="pop-close" title="Close">\u2715</button>' +
      '</div>' +
      '<div class="pop-body">' +
        '<label class="pop-label">Category</label>' +
        '<select class="pop-select" id="pop-cat">' + catOpts + '</select>' +
        '<label class="pop-label" style="margin-top:8px">Label ' +
          '<small style="font-weight:400;text-transform:none">(optional)</small></label>' +
        '<input class="pop-input" id="pop-lbl" type="text" value="' +
          escHtml(block.label) + '" placeholder="e.g. CS 101"/>' +
        '<div class="pop-err" id="pop-err" style="display:none"></div>' +
      '</div>' +
      '<div class="pop-footer">' +
        '<button class="btn-pop-primary">Save</button>' +
        '<button class="btn-pop-danger">Delete</button>' +
      '</div>';

    document.body.appendChild(pop);
    positionPopover(pop, blockEl);
    activePopover = pop;

    // Clear error styling on input change
    pop.querySelectorAll('.pop-time-input').forEach(function(inp) {
      inp.addEventListener('change', function() {
        inp.style.borderColor = '';
        pop.querySelector('#pop-err').style.display = 'none';
      });
    });

    pop.querySelector('.pop-close').addEventListener('click', closePopover);

    pop.querySelector('.btn-pop-primary').addEventListener('click', function() {
      var newStart = strToMin(pop.querySelector('#pop-start').value);
      var newEnd   = strToMin(pop.querySelector('#pop-end').value);
      var errEl    = pop.querySelector('#pop-err');

      // Validate
      if (newEnd <= newStart) {
        pop.querySelector('#pop-start').style.borderColor = '#dc2626';
        pop.querySelector('#pop-end').style.borderColor   = '#dc2626';
        errEl.textContent = 'End must be after start.';
        errEl.style.display = 'block';
        return;
      }
      if (newEnd - newStart < MIN_DUR) {
        pop.querySelector('#pop-end').style.borderColor = '#d97706';
        errEl.textContent = 'Minimum duration is ' + MIN_DUR + ' min.';
        errEl.style.display = 'block';
        return;
      }

      // Clamp to calendar bounds
      newStart = Math.max(CAL_START, Math.min(CAL_END - MIN_DUR, snap(newStart)));
      newEnd   = Math.max(newStart + MIN_DUR, Math.min(CAL_END, snap(newEnd)));

      if (!overlaps(day, newStart, newEnd, block.id)) {
        block.start = newStart;
        block.end   = newEnd;
      }

      block.category = pop.querySelector('#pop-cat').value;
      block.label    = pop.querySelector('#pop-lbl').value.trim();
      renderDay(day);
      serialize();
      closePopover();
    });

    pop.querySelector('.btn-pop-danger').addEventListener('click', function() {
      schedule[day] = schedule[day].filter(function(b) { return b.id !== blockId; });
      renderDay(day);
      serialize();
      closePopover();
    });

    // Close on outside click (defer so this mousedown doesn't trigger it)
    setTimeout(function() {
      document.addEventListener('mousedown', onOutsideClick);
    }, 10);
  }

  function onOutsideClick(e) {
    if (activePopover && !activePopover.contains(e.target)) {
      closePopover();
    }
  }

  function closePopover() {
    if (activePopover) { activePopover.remove(); activePopover = null; }
    document.removeEventListener('mousedown', onOutsideClick);
  }

  function positionPopover(pop, blockEl) {
    var rect = blockEl.getBoundingClientRect();
    var pw   = 234;
    var left = rect.right + 10;
    var top  = rect.top;
    if (left + pw > window.innerWidth - 8)  { left = rect.left - pw - 10; }
    if (left < 8)                            { left = 8; }
    if (top + 280 > window.innerHeight - 8) { top = window.innerHeight - 288; }
    pop.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;';
  }

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function findBlock(day, id) {
    for (var i = 0; i < schedule[day].length; i++) {
      if (schedule[day][i].id === id) return schedule[day][i];
    }
    return null;
  }

  // ── Render a single block element ────────────────────────────────────────
  function makeBlockEl(day, block) {
    var cat   = CATEGORIES[block.category] || CATEGORIES.others;
    var topPx = minToY(block.start);
    var htPx  = (block.end - block.start) * PX_PER_MIN;
    var dur   = block.end - block.start;
    var lbl   = block.label ? ' \u00B7 ' + block.label : '';

    var el = document.createElement('div');
    el.className = 'cal-block';
    el.dataset.id  = block.id;
    el.dataset.day = day;
    el.style.cssText =
      'top:'               + topPx      + 'px;' +
      'height:'            + htPx       + 'px;' +
      'background:'        + cat.bg     + ';'   +
      'border-left-color:' + cat.border + ';'   +
      'color:'             + cat.text   + ';';

    var timeStr = minTo12(block.start) + ' \u2013 ' + minTo12(block.end) + ' \u00B7 ' + durLabel(dur);

    el.innerHTML =
      '<div class="cal-block-content">' +
        '<div class="cal-block-cat">'  + escHtml(cat.label + lbl) + '</div>' +
        (dur >= 30 ? '<div class="cal-block-time">' + timeStr + '</div>' : '') +
      '</div>' +
      '<div class="cal-block-resize"></div>';

    // ── Drag-to-move + click-to-popover ────────────────────────────────────
    el.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('cal-block-resize')) return;
      e.stopPropagation();
      e.preventDefault();
      closePopover();

      var colBody  = el.closest('.cal-col-body');
      var startX   = e.clientX;
      var startY   = e.clientY;
      var moved    = false;
      var blockDur = block.end - block.start;

      // Where inside the block did we click? (for natural drag feel)
      // getBoundingClientRect().top already accounts for scroll — NO scrollTop needed
      var clickRelY  = e.clientY - colBody.getBoundingClientRect().top;
      var dragOffset = clickRelY - minToY(block.start);

      function onMove(me) {
        var dx = me.clientX - startX, dy = me.clientY - startY;
        if (!moved && (Math.abs(dx) + Math.abs(dy)) > 4) {
          moved = true;
          el.classList.add('cal-block-dragging');
        }
        if (!moved) return;

        // Re-query rect each move so we're always current even if page scrolls
        var relY     = me.clientY - colBody.getBoundingClientRect().top;
        var newStart = snap(Math.round(yToMin(relY - dragOffset)));
        newStart = Math.max(CAL_START, Math.min(CAL_END - blockDur, newStart));
        var newEnd = newStart + blockDur;

        if (!overlaps(day, newStart, newEnd, block.id)) {
          block.start = newStart;
          block.end   = newEnd;
          el.style.top = minToY(newStart) + 'px';
          var timeEl = el.querySelector('.cal-block-time');
          if (timeEl) {
            timeEl.textContent = minTo12(block.start) + ' \u2013 ' + minTo12(block.end) +
                                 ' \u00B7 ' + durLabel(blockDur);
          }
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',  onUp);
        el.classList.remove('cal-block-dragging');
        if (moved) {
          renderDay(day);
          serialize();
        } else {
          showPopover(el, day, block.id);
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',  onUp);
    });

    // ── Resize drag (bottom handle) ────────────────────────────────────────
    var rHandle = el.querySelector('.cal-block-resize');
    rHandle.addEventListener('mousedown', function(e) {
      e.stopPropagation();
      e.preventDefault();
      closePopover();

      var colBody = el.closest('.cal-col-body');

      function onMove(me) {
        // getBoundingClientRect is live — no scrollTop correction needed
        var relY   = me.clientY - colBody.getBoundingClientRect().top;
        var newEnd = snap(Math.round(yToMin(relY)));
        newEnd = Math.max(block.start + MIN_DUR, Math.min(CAL_END, newEnd));
        if (!overlaps(day, block.start, newEnd, block.id)) {
          block.end = newEnd;
          el.style.height = ((block.end - block.start) * PX_PER_MIN) + 'px';
          var timeEl = el.querySelector('.cal-block-time');
          if (timeEl) {
            timeEl.textContent = minTo12(block.start) + ' \u2013 ' + minTo12(block.end) +
                                 ' \u00B7 ' + durLabel(block.end - block.start);
          }
        }
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',  onUp);
        renderDay(day);
        serialize();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',  onUp);
    });

    return el;
  }

  // ── Render all blocks for a day ──────────────────────────────────────────
  function renderDay(day) {
    var colBody = document.querySelector('.cal-col-body[data-day="' + day + '"]');
    if (!colBody) return;
    var old = colBody.querySelectorAll('.cal-block');
    for (var i = 0; i < old.length; i++) { old[i].remove(); }
    schedule[day].forEach(function(block) {
      colBody.appendChild(makeBlockEl(day, block));
    });
    serialize();
  }

  // ── Drag-to-create ───────────────────────────────────────────────────────
  function initColDrag(colBody, day) {
    var phantom   = null;
    var dragStart = null;

    colBody.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.cal-block')) return;
      e.preventDefault();
      closePopover();

      // getBoundingClientRect already accounts for scroll — correct position
      var relY  = e.clientY - colBody.getBoundingClientRect().top;
      dragStart = snap(Math.round(yToMin(relY)));
      dragStart = Math.max(CAL_START, Math.min(CAL_END - MIN_DUR, dragStart));

      phantom = document.createElement('div');
      phantom.className    = 'cal-phantom';
      phantom.style.top    = minToY(dragStart) + 'px';
      phantom.style.height = (MIN_DUR * PX_PER_MIN) + 'px';
      colBody.appendChild(phantom);

      function onMove(me) {
        if (!phantom) return;
        var y   = me.clientY - colBody.getBoundingClientRect().top;
        var cur = snap(Math.round(yToMin(y)));
        var end = Math.max(dragStart + MIN_DUR, Math.min(CAL_END, cur));
        phantom.style.top    = minToY(dragStart) + 'px';
        phantom.style.height = ((end - dragStart) * PX_PER_MIN) + 'px';
      }

      function onUp(me) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',  onUp);
        if (!phantom) return;
        phantom.remove();
        phantom = null;

        var y   = me.clientY - colBody.getBoundingClientRect().top;
        var end = snap(Math.round(yToMin(y)));
        end = Math.max(dragStart + MIN_DUR, Math.min(CAL_END, end));

        if (!overlaps(day, dragStart, end, null)) {
          var block = {
            id:       nextId(),
            start:    dragStart,
            end:      end,
            category: 'others',
            label:    '',
          };
          schedule[day].push(block);
          schedule[day].sort(function(a, b) { return a.start - b.start; });
          renderDay(day);
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',  onUp);
    });
  }

  // ── Build DOM ────────────────────────────────────────────────────────────
  function build(containerEl) {
    loadWeekendPref();

    // Toolbar — weekend toggle sits top-right above the day headers
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

    // Scrollable body
    var scrollBody = document.createElement('div');
    scrollBody.className = 'cal-scroll-body';

    // Time axis — pointer-events:none prevents axis clicks from creating blocks
    var timeAxis = document.createElement('div');
    timeAxis.className = 'cal-time-axis';
    timeAxis.style.height = TOTAL_H + 'px';
    for (var m = CAL_START; m <= CAL_END; m += 60) {
      var lbl = document.createElement('div');
      lbl.className = 'cal-time-label';
      lbl.style.top = minToY(m) + 'px';
      lbl.textContent = minTo12(m).replace(':00 ', ' ');  // "8 AM", "12 PM"
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
      colBody.className  = 'cal-col-body';
      colBody.dataset.day = day;
      colBody.style.height = TOTAL_H + 'px';

      // Grid lines
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

    // Wire toggle
    toggleBtn.addEventListener('click', function() {
      showWeekends = !showWeekends;
      try { localStorage.setItem(LS_WEEKENDS, showWeekends ? 'true' : 'false'); } catch(e) {}
      applyWeekendPref(outer);
      updateToggleLabel(toggleBtn);
    });

    applyWeekendPref(outer);

    // Scroll to 7 AM on load
    scrollBody.scrollTop = minToY(7 * 60);
  }

  // ── Serialize to hidden input + localStorage ──────────────────────────────
  function serialize() {
    var result = {};
    DAYS.forEach(function(day) {
      result[day] = schedule[day].map(function(b) {
        return {
          time_in:  minToStr(b.start),
          time_out: minToStr(b.end),
          category: b.category,
          label:    b.label,
        };
      });
    });
    var json = JSON.stringify(result);
    var inp  = document.getElementById('schedule-json');
    if (inp) inp.value = json;
    try { localStorage.setItem('fdtr_schedule', json); } catch(e) {}
  }

  // ── Load from data object ────────────────────────────────────────────────
  function load(data) {
    DAYS.forEach(function(day) {
      schedule[day] = [];
      var slots = (data && data[day]) || [];
      slots.forEach(function(s) {
        var st = strToMin(s.time_in);
        var en = strToMin(s.time_out);
        if (st >= CAL_START && en <= CAL_END && en > st) {
          schedule[day].push({
            id:       nextId(),
            start:    st,
            end:      en,
            category: s.category || 'others',
            label:    s.label    || '',
          });
        }
      });
      schedule[day].sort(function(a, b) { return a.start - b.start; });
      renderDay(day);
    });
    serialize();
  }

  // ── Weekend visibility ────────────────────────────────────────────────────
  var LS_WEEKENDS  = 'fdtr_show_weekends';
  var showWeekends = true;

  function loadWeekendPref() {
    try {
      var v = localStorage.getItem(LS_WEEKENDS);
      if (v === 'false') showWeekends = false;
    } catch(e) {}
  }

  function applyWeekendPref(outerEl) {
    outerEl.classList.toggle('cal-hide-weekends', !showWeekends);
  }

  function updateToggleLabel(btn) {
    btn.textContent = showWeekends ? '\uD83D\uDDD3 Hide Weekends' : '\uD83D\uDDD3 Show Weekends';
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
        ';border:2px solid ' + c.border + '"></div>' +
        '<span>' + c.label + '</span>';
      wrap.appendChild(item);
    });

    var hint = document.createElement('div');
    hint.className = 'cal-legend-item';
    hint.style.cssText = 'margin-left:auto;color:#94a3b8';
    hint.innerHTML = '<small>Drag empty to create &nbsp;\u00B7&nbsp; Drag block to move &nbsp;\u00B7&nbsp; Drag bottom to resize &nbsp;\u00B7&nbsp; Click to edit</small>';
    wrap.appendChild(hint);
    containerEl.appendChild(wrap);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  window.calendarWidget = {
    build: function(containerEl, initialData) {
      build(containerEl);
      buildLegend(containerEl);
      if (initialData) {
        load(initialData);
      } else {
        serialize();   // ensure hidden field + localStorage always populated
      }
    },
    load:        load,
    save:        serialize,   // exposed so Save button can call calendarWidget.save()
    getSchedule: function() {
      var result = {};
      DAYS.forEach(function(day) {
        result[day] = schedule[day].map(function(b) {
          return {
            time_in:  minToStr(b.start),
            time_out: minToStr(b.end),
            category: b.category,
            label:    b.label,
          };
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
