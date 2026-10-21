/* ============================================================
   FDTR Generator — First-visit guided tour (setup + generate)
   Spotlight + tooltip card, animated demos, no dependencies.
   Each page's tour shows once per browser; replay via [data-tour-start].
   ============================================================ */

(function () {
  "use strict";

  var PAD = 8;        // spotlight padding around the target (px)
  var GAP = 14;       // space between spotlight and card (px)
  var NAV_H = 56;     // sticky .navbar height — keep targets below it

  var CAT = {
    class:   { label: 'Class',              bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    consult: { label: 'Consultation',       bg: '#dcfce7', border: '#22c55e', text: '#166634' },
    related: { label: 'Related Activities', bg: '#fef9c3', border: '#ca8a04', text: '#713f12' },
    others:  { label: 'Others (Adm.)',      bg: '#f1f5f9', border: '#94a3b8', text: '#334155' }
  };

  function hasProfile() {
    try {
      var p = JSON.parse(localStorage.getItem('fdtr_profile') || 'null');
      return !!(p && p.faculty_name && String(p.faculty_name).trim());
    } catch (e) { return false; }
  }

  // ── Tour definitions ───────────────────────────────────────────────────
  var TOURS = {
    setup: {
      form: 'setup-form',
      key:  'fdtr_tour_done',
      steps: [
        {
          title: 'Welcome! Let’s make your FDTR',
          body: 'You’ll enter your details and weekly schedule once. After that, this website fills ' +
                'out your Faculty Daily Time Record for any month. This short tour takes about a minute.',
          next: 'Show me how'
        },
        {
          target: '#setup-form > .card:first-of-type',
          title: 'Your details',
          body: 'Type your name, position, department, and department head exactly as they should ' +
                'appear on the printed FDTR.'
        },
        {
          target: '.cal-section .callout',
          title: 'Open your class schedule',
          body: 'Open the MSU-IIT portal in another tab and go to <strong>Academics › Class Schedule</strong>. ' +
                'You’ll copy your classes from there onto the calendar.'
        },
        {
          target: '#cal-container',
          demo: 'drag',
          title: 'Add a time block',
          body: '<strong>Double-click</strong> an empty spot for a 1-hour block, or <strong>click and drag</strong> ' +
                'down a day, like the demo shows. On a phone: double-tap, or press and hold, then drag.'
        },
        {
          target: '#cal-container',
          demo: 'category',
          title: 'Say what it is',
          body: '<strong>Click a block</strong> and choose what it is: Class, Consultation, Related Activities, ' +
                'or Others. Add a name like “CS 101”, and tick other days with the same time ' +
                '(for example M, W, F).'
        },
        {
          target: '.preset-bar',
          title: 'Keep a schedule per semester',
          body: 'Use <strong>Save this week as…</strong> to keep a copy under a name like ' +
                '“1st Sem 2026”, and <strong>Open</strong> it again later.'
        },
        {
          target: '.nav-data',
          title: 'Moving to another computer?',
          body: 'Your information is saved only in this browser. <strong>Backup &amp; restore</strong> gives ' +
                'you one file you can open on another computer to bring everything with you.'
        },
        {
          target: '.btn-generate',
          title: 'Then choose a month',
          body: function () {
            return hasProfile()
              ? 'Click <strong>Next: choose a month</strong> whenever you’re ready. Let’s look at that page now.'
              : 'When your details and schedule are in, click <strong>Next: choose a month</strong>. ' +
                'The tour continues on that page.';
          },
          next: function () { return hasProfile() ? 'Go to the next page →' : 'Got it'; },
          after: function () { if (hasProfile()) location.href = 'generate.html'; }
        }
      ]
    },

    generate: {
      form: 'generate-form',
      key:  'fdtr_tour_gen_done',
      steps: [
        {
          target: '.page-header',
          title: 'Step 2: make your FDTR',
          body: 'Check that your name and department are right. If not, click ' +
                '<strong>Change my details or schedule</strong>.'
        },
        {
          target: '#month-card',
          title: 'Choose the month',
          body: 'Pick the month and year. The summary below shows what will go into your FDTR.'
        },
        {
          target: '#entries-card',
          title: 'Anything different this month?',
          body: 'Your weekly schedule is filled in for you. Use the tabs to add only the days that were ' +
                'different: <strong>holidays, leave, travel</strong> or <strong>suspended classes</strong>. ' +
                'The number on each tab shows how many you’ve added.'
        },
        {
          target: '#actions-card',
          title: 'Preview, then download',
          body: 'Click <strong>Preview my FDTR</strong> to check it, then download it as an Excel file. ' +
                'Everything here saves automatically.'
        },
        {
          target: '#history-card',
          title: 'Your past records',
          body: 'Every FDTR you download is kept here, so you can download it again or make changes later.',
          next: 'Done'
        }
      ]
    }
  };

  var tour, idx = 0;
  var root, spot, card, demo, lastFocus;

  function store(key, v) {
    try {
      if (v === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, v);
    } catch (e) { return null; }
  }
  function val(v) { return typeof v === 'function' ? v() : v; }
  function viewport() {
    return { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
  }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── DOM ────────────────────────────────────────────────────────────────
  function build() {
    root = document.createElement('div');
    root.className = 'tour-root';

    spot = document.createElement('div');
    spot.className = 'tour-spot';

    demo = document.createElement('div');
    demo.className = 'tour-demo';
    demo.setAttribute('aria-hidden', 'true');

    card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'tour-title');
    card.setAttribute('aria-describedby', 'tour-body');
    card.innerHTML =
      '<div class="tour-head">' +
        '<span class="tour-count" aria-live="polite"></span>' +
        '<button type="button" class="tour-skip">Skip tour</button>' +
      '</div>' +
      '<h3 class="tour-title" id="tour-title"></h3>' +
      '<p class="tour-body" id="tour-body"></p>' +
      '<div class="tour-foot">' +
        '<div class="tour-dots" aria-hidden="true"></div>' +
        '<div class="tour-btns">' +
          '<button type="button" class="tour-back">Back</button>' +
          '<button type="button" class="tour-next">Next</button>' +
        '</div>' +
      '</div>';

    root.appendChild(spot);
    root.appendChild(demo);
    root.appendChild(card);
    document.body.appendChild(root);

    card.querySelector('.tour-skip').addEventListener('click', end);
    card.querySelector('.tour-back').addEventListener('click', function () { go(idx - 1); });
    card.querySelector('.tour-next').addEventListener('click', function () {
      if (idx < tour.steps.length - 1) { go(idx + 1); return; }
      var after = tour.steps[idx].after;
      end();
      if (after) after();
    });
    // Clicking the dimmed backdrop does nothing — avoids accidental dismissal
    root.addEventListener('mousedown', function (e) {
      if (!card.contains(e.target)) e.preventDefault();
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  function go(i) {
    var steps = tour.steps;
    idx = Math.max(0, Math.min(steps.length - 1, i));
    var step = steps[idx];
    var target = step.target ? document.querySelector(step.target) : null;
    var last = idx === steps.length - 1;

    card.querySelector('.tour-count').textContent = (idx + 1) + ' of ' + steps.length;
    card.querySelector('.tour-title').textContent = step.title;
    card.querySelector('.tour-body').innerHTML    = val(step.body);
    card.querySelector('.tour-back').hidden       = idx === 0;
    card.querySelector('.tour-next').textContent  = val(step.next) || (last ? 'Got it' : 'Next');
    card.querySelector('.tour-dots').innerHTML = steps.map(function (_, j) {
      return '<span class="' + (j === idx ? 'on' : '') + '"></span>';
    }).join('');

    root.classList.toggle('tour-centered', !target);
    buildDemo(step.demo);

    // Targets in the sticky navbar are always visible — no scrolling needed
    if (target && !target.closest('.navbar')) {
      var vh = viewport().h;
      var r = target.getBoundingClientRect();
      var fits = r.height + PAD * 2 <= vh - NAV_H - 24;
      // Tall targets (the calendar) align to the top so the card has room below
      var y = window.scrollY + r.top - NAV_H - PAD - 16;
      if (fits) y -= Math.max(0, (vh - NAV_H - r.height) / 2 - 80);
      window.scrollTo({ top: Math.max(0, y), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    // Position after the scroll settles (smooth scroll is async)
    clearTimeout(go._t);
    go._t = setTimeout(place, reducedMotion() ? 0 : 320);
    place();

    card.querySelector('.tour-next').focus({ preventScroll: true });
  }

  function place() {
    if (!root) return;
    var step = tour.steps[idx];
    var target = step.target ? document.querySelector(step.target) : null;
    var v = viewport(), vw = v.w, vh = v.h;
    var cw = card.offsetWidth, ch = card.offsetHeight;

    if (!target) {
      spot.style.cssText = 'top:50%;left:50%;width:0;height:0;';
      card.style.left = Math.round((vw - cw) / 2) + 'px';
      card.style.top  = Math.round((vh - ch) / 2) + 'px';
      return;
    }

    var r = target.getBoundingClientRect();
    // Clip the spotlight to the visible area below the navbar (unless the target is in it)
    var minTop = target.closest('.navbar') ? 4 : NAV_H + 4;
    var top    = Math.max(minTop, r.top - PAD);
    var bottom = Math.min(vh - 4, r.bottom + PAD);
    var left   = Math.max(4, r.left - PAD);
    var right  = Math.min(vw - 4, r.right + PAD);
    spot.style.cssText =
      'top:' + top + 'px;left:' + left + 'px;' +
      'width:' + (right - left) + 'px;height:' + Math.max(0, bottom - top) + 'px;';

    // Card: below → above → overlaid in the bottom-right corner of the spotlight
    // (on the calendar that's the weekend columns, the least likely to hold blocks)
    var cl = Math.max(16, Math.min(left, vw - cw - 16));
    var ct;
    if (bottom + GAP + ch <= vh - 16)              ct = bottom + GAP;
    else if (top - GAP - ch >= NAV_H + 16)         ct = top - GAP - ch;
    else {
      ct = Math.max(NAV_H + 16, vh - ch - 24);
      cl = Math.max(16, Math.min(right - cw - 16, vw - cw - 16));
    }
    card.style.left = Math.round(cl) + 'px';
    card.style.top  = Math.round(ct) + 'px';

    placeDemo();
  }

  // ── Animated demos (calendar steps) ────────────────────────────────────
  // A looping mock drawn over an empty weekday column, 8–11 AM.
  // Purely visual: it never touches the real schedule.
  var demoCol = null;

  var CURSOR_SVG =
    '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6.9 3.9 7.4-2.7 1.4-3.9-7.5L4 20z" ' +
    'fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function blockHtml(cat, cls, time) {
    var c = CAT[cat];
    return '<div class="td-block ' + cls + '" style="background:' + c.bg + ';border-left-color:' +
           c.border + ';color:' + c.text + '"><b>' + c.label + '</b><span>' + time + '</span></div>';
  }

  function hourLineY(col, i) {
    return parseFloat(col.querySelectorAll('.cal-hour-line')[i].style.top);
  }

  // Weekday column with nothing between 8 and 11 AM, preferring mid-week
  function pickColumn() {
    var order = ['wednesday', 'tuesday', 'thursday', 'monday', 'friday'];
    for (var i = 0; i < order.length; i++) {
      var col = document.querySelector('.cal-col-body[data-day="' + order[i] + '"]');
      if (!col || !col.offsetWidth) continue;
      var y8 = hourLineY(col, 2), y11 = hourLineY(col, 5);
      var busy = Array.prototype.some.call(col.querySelectorAll('.cal-block'), function (b) {
        return b.offsetTop < y11 && b.offsetTop + b.offsetHeight > y8;
      });
      if (!busy) return col;
    }
    return document.querySelector('.cal-col-body[data-day="wednesday"]');
  }

  function buildDemo(kind) {
    demo.innerHTML = '';
    demo.className = 'tour-demo';
    demoCol = null;
    if (!kind) return;

    demoCol = pickColumn();
    if (!demoCol) return;
    demo.classList.add('td-' + kind);

    if (kind === 'drag') {
      demo.innerHTML =
        '<div class="td-ghost"></div>' +
        blockHtml('others', 'td-made', '8:00 – 11:00 AM') +
        '<div class="td-cursor">' + CURSOR_SVG + '</div>';
    } else {
      var opts = ['class', 'consult', 'related', 'others'].map(function (k) {
        return '<div class="td-opt"><i style="background:' + CAT[k].border + '"></i>' + CAT[k].label + '</div>';
      }).join('');
      demo.innerHTML =
        blockHtml('others', 'td-before', '8:00 – 11:00 AM') +
        blockHtml('class',  'td-after',  'CS 101 · 8:00 – 11:00 AM') +
        '<div class="td-pop"><div class="td-pop-label">Category</div>' +
          '<div class="td-opts"><div class="td-hl"></div>' + opts + '</div></div>' +
        '<div class="td-cursor">' + CURSOR_SVG + '</div>';
    }
  }

  function placeDemo() {
    if (!demoCol) return;
    var vw = viewport().w;
    var r = demoCol.getBoundingClientRect();
    var y8 = hourLineY(demoCol, 2), y11 = hourLineY(demoCol, 5);
    var h = y11 - y8;

    demo.style.left   = r.left + 'px';
    demo.style.top    = r.top + 'px';
    demo.style.width  = r.width + 'px';
    demo.style.height = r.height + 'px';
    // Never draw over the navbar while the page scrolls
    var clipTop = Math.max(0, NAV_H - r.top);
    demo.style.clipPath = 'inset(' + clipTop + 'px -400px 0 -400px)';
    demo.style.setProperty('--y', y8 + 'px');
    demo.style.setProperty('--h', h + 'px');

    if (demo.classList.contains('td-category')) {
      var POP_W = 168, OPT_H = 26, HEAD_H = 26;
      var right = r.right + 8 + POP_W <= vw - 8;
      var popX  = right ? r.width + 8 : -8 - POP_W;     // relative to column left
      var curX  = r.width / 2, curY = y8 + h / 2;        // cursor rests on the block
      demo.style.setProperty('--pop-x', popX + 'px');
      demo.style.setProperty('--px', (popX + 60 - curX) + 'px');
      demo.style.setProperty('--py-others', (y8 + HEAD_H + OPT_H * 3.5 - curY) + 'px');
      demo.style.setProperty('--py-class',  (y8 + HEAD_H + OPT_H * 0.5 - curY) + 'px');
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); card.querySelector('.tour-next').click(); }
    else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'Tab') {                       // keep focus inside the card
      var f = Array.prototype.filter.call(card.querySelectorAll('button'), function (b) { return !b.hidden; });
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0)                   { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function start() {
    if (root || !tour) return;
    lastFocus = document.activeElement;
    build();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    if (window.scrollY > 0) window.scrollTo(0, 0);
    go(0);
  }

  function end() {
    if (!root) return;
    store(tour.key, '1');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
    root.remove();
    root = spot = card = demo = demoCol = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(TOURS).forEach(function (k) {
      if (document.getElementById(TOURS[k].form)) tour = TOURS[k];
    });
    if (!tour) return;

    document.querySelectorAll('[data-tour-start]').forEach(function (btn) {
      btn.addEventListener('click', start);
    });

    if (!store(tour.key)) setTimeout(start, 400);   // let the page render first
  });

  window.fdtrTour = { start: start, end: end };
})();
