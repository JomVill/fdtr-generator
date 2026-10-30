/* ============================================================
   FDTR Generator — Preview
   - Renders the FDTR document (one source for the markup)
   - Opens it in a full preview window from the Generate page:
     paper-sized page, zoom, totals, checks, Download / Print
   - preview.html still works on its own (reads sessionStorage)
   ============================================================ */

(function () {
  "use strict";

  var LS_PREVIEW = "fdtr_preview_payload";
  var CATS = ["class", "consultation", "related_activities", "others"];
  var CAT_LABEL = {
    class: "Class", consultation: "Consultation",
    related_activities: "Related Activities", others: "Others (Adm.)"
  };
  // Folio sheet ("long bond"), 8.5 × 13 in at 96 px/in, with 0.25 in margins —
  // the same page and margins the Excel file is set up to print on.
  // Printed back to back: front = header + days 1–15, back = days 16–end + signatures.
  var PAPER_W = 816, PAPER_H = 1248, MARGIN = 24;      // 0.25 in margins
  var AREA_W = PAPER_W - 2 * MARGIN, AREA_H = PAPER_H - 2 * MARGIN;
  var GAP = 24;                                         // space between the two sheets on screen
  var PARTS = ['front', 'back'];

  // Builds sizer > [paper: front, paper: back] inside `host` and renders the record into them
  function mountSheet(host, preview) {
    host.innerHTML =
      '<div class="pv-sizer">' +
        PARTS.map(function (part) {
          return '<div class="pv-paper pv-paper-' + part + '"><div class="pv-page"></div></div>';
        }).join('') +
      '</div>';
    var sizer = host.querySelector('.pv-sizer');
    var papers = Array.prototype.slice.call(sizer.querySelectorAll('.pv-paper'));
    papers.forEach(function (paper, i) {
      renderPage(paper.querySelector('.pv-page'), preview, PARTS[i]);
    });
    var pages = papers.map(function (p) { return p.querySelector('.pv-page'); });
    return { sizer: sizer, papers: papers, pages: pages, scale: fitSheet(pages) };
  }

  // Both pages use the full printable width at natural size (like the Excel file's
  // columns). If either page is taller than the printable height, both shrink by the
  // same amount so they stay consistent. If a page is shorter, its day rows grow so
  // the record fills the whole printable height, leaving the same margin on every side.
  function fitSheet(pages) {
    pages.forEach(function (page) {
      page.style.transform = 'none';
      page.style.left = MARGIN + 'px';
      page.style.width = AREA_W + 'px';
      page.querySelectorAll('tr.day-row > td').forEach(function (td) { td.style.height = ''; });
    });
    var nh = 0;
    pages.forEach(function (page) { nh = Math.max(nh, page.scrollHeight); });
    var sc = Math.min(1, AREA_H / nh);
    // Fill the printable height at this scale (in unscaled px), so shorter pages grow to match
    pages.forEach(function (page) { stretchDays(page, Math.floor(AREA_H / sc) - page.scrollHeight); });
    pages.forEach(function (page) {
      page.style.transform = 'scale(' + sc + ')';
      page.style.left = (MARGIN + (AREA_W - AREA_W * sc) / 2) + 'px';
    });
    return sc;
  }

  // Spreads `extra` px evenly over the day blocks of one page. A regular day is three
  // sub-rows; a weekend or holiday/leave row is one row drawn at the same three-line height.
  function stretchDays(page, extra) {
    var rows = Array.prototype.slice.call(page.querySelectorAll('tr.day-row'));
    if (extra <= 0 || !rows.length) return;
    var units = rows.reduce(function (n, tr) { return n + (tr.classList.contains('day-special') ? 3 : 1); }, 0);
    var perUnit = extra / units;
    rows.forEach(function (tr) {
      var h = tr.offsetHeight + perUnit * (tr.classList.contains('day-special') ? 3 : 1);
      tr.querySelectorAll(':scope > td').forEach(function (td) { td.style.height = h + 'px'; });
    });
  }

  // Scales the sheets on screen (or for PDF at z = 1); the sizer reserves the scaled size for scrolling
  function zoomSheet(sheet, z) {
    var step = PAPER_H + GAP;
    sheet.papers.forEach(function (paper, i) {
      paper.style.transform = 'scale(' + z + ')';
      paper.style.top = Math.round(i * step * z) + 'px';
    });
    sheet.sizer.style.width  = Math.round(PAPER_W * z) + 'px';
    sheet.sizer.style.height = Math.round((PAPER_H * sheet.papers.length + GAP * (sheet.papers.length - 1)) * z) + 'px';
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Document markup (split into the two printed pages) ─────────────────
  // Front page: institution header, name/department, column headers, days 1–15
  var INST_ROWS =
        '<tr><td colspan="14" class="inst-line">Republic of the Philippines</td></tr>' +
        '<tr><td colspan="14" class="inst-line inst-bold">Mindanao State University</td></tr>' +
        '<tr><td colspan="14" class="inst-line inst-bold inst-large">ILIGAN INSTITUTE OF TECHNOLOGY</td></tr>' +
        '<tr><td colspan="14" class="inst-line">Iligan City</td></tr>' +
        '<tr><td colspan="14" class="inst-blank">&nbsp;</td></tr>' +
        '<tr><td colspan="14" class="inst-title">FACULTY DAILY TIME RECORD</td></tr>' +
        '<tr><td colspan="14" class="inst-month" data-f="month-line"></td></tr>' +
        '<tr><td colspan="14" class="inst-blank">&nbsp;</td></tr>' +
        '<tr class="fdtr-bordered">' +
          '<td colspan="8" class="name-dept-cell" data-f="name"></td>' +
          '<td colspan="6" class="name-dept-cell" data-f="dept"></td>' +
        '</tr>';

  // Column headers (repeated at the top of the back page)
  var COL_ROWS =
        '<tr class="fdtr-colheader">' +
          '<th rowspan="2" class="th-day">DAY</th>' +
          '<th colspan="3">CLASS</th>' +
          '<th colspan="3">CONSULTATION</th>' +
          '<th colspan="3" class="th-cat-related">RELATED<br>ACTIVITIES</th>' +
          '<th colspan="3">OTHERS<br><span class="th-sub">(Adm., R&amp;E)</span></th>' +
          '<th rowspan="2" class="th-total">Total<br>Hours</th>' +
        '</tr>' +
        '<tr class="fdtr-colheader">' +
          new Array(5).join(
            '<th class="th-sub-col">Time In</th><th class="th-sub-col">Time Out</th><th class="th-sub-col">Hrs</th>') +
        '</tr>';

  // Back page: certification and signatures
  var FOOT_ROWS =
        '<tr><td colspan="14" class="footer-cert" data-f="cert"></td></tr>' +
        '<tr>' +
          '<td colspan="6" class="footer-sig-cell">' +
            '<div class="footer-name" data-f="sig-name"></div>' +
            '<div class="footer-label">(Signature over printed name)</div>' +
            '<div class="footer-desig" data-f="sig-desig"></div>' +
          '</td>' +
          '<td colspan="2" class="footer-spacer"></td>' +
          '<td colspan="6" class="footer-sig-cell">' +
            '<div class="footer-name" data-f="sig-head"></div>' +
            '<div class="footer-label">(Head of Dept./Unit)</div>' +
          '</td>' +
        '</tr>';

  function renderBody(rows) {
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.type === "special") {
        var totalDisplay = "";
        if (row.total === 0) totalDisplay = "0";
        else if (row.total != null && row.total !== "") totalDisplay = String(row.total);

        html +=
          '<tr class="day-row day-special day-' + escHtml(row.day_class) + '">' +
            '<td class="td-day">' + escHtml(row.day) + '</td>' +
            '<td colspan="12" class="td-special-label">' + escHtml(row.label) + '</td>' +
            '<td class="td-total">' + totalDisplay + '</td>' +
          '</tr>';
      } else {
        // Regular / related_activities: 3 sub-rows
        var totalStr = (row.total === "" || row.total == null) ? "" : String(row.total);
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

        // No rowspan: the PDF renderer drops text in spanning cells. Each day is three
        // ordinary rows; the day number and total sit in the middle row, and the
        // borders between the three lines are hidden in those two columns.
        var cls = 'day-row day-' + escHtml(row.day_class);
        html +=
          '<tr class="' + cls + ' day-line-1">' +
            '<td class="td-day td-span-top"></td>' + subrow(0) +
            '<td class="td-total td-span-top"></td>' +
          '</tr>' +
          '<tr class="' + cls + ' day-line-2 day-subrow">' +
            '<td class="td-day td-span-mid">' + escHtml(row.day) + '</td>' + subrow(1) +
            '<td class="td-total td-span-mid">' + escHtml(totalStr) + '</td>' +
          '</tr>' +
          '<tr class="' + cls + ' day-line-3 day-subrow">' +
            '<td class="td-day td-span-bot"></td>' + subrow(2) +
            '<td class="td-total td-span-bot"></td>' +
          '</tr>';
      }
    }
    return html;
  }

  // Fills `container` with one printed page of the FDTR: 'front' (days 1–15) or 'back' (days 16–end)
  function renderPage(container, preview, part) {
    var front = part === 'front';
    container.innerHTML = front
      ? '<table class="fdtr-table"><thead class="fdtr-institution">' + INST_ROWS + COL_ROWS +
        '</thead><tbody data-f="body"></tbody></table>'
      : '<table class="fdtr-table"><thead>' + COL_ROWS +
        '</thead><tbody data-f="body"></tbody><tfoot>' + FOOT_ROWS + '</tfoot></table>';

    var monthLabel = (preview.month_name || "") + " " + (preview.year || "");
    function f(name, text) {
      var el = container.querySelector('[data-f="' + name + '"]');
      if (el) el.textContent = text;
    }
    var rows = (preview.days || []).filter(function (r) {
      return front ? r.day <= 15 : r.day >= 16;
    });
    container.querySelector('[data-f="body"]').innerHTML = renderBody(rows);
    f("month-line", "For the month of " + monthLabel);
    f("name", "NAME: " + (preview.faculty_name || ""));
    f("dept", "DEPARTMENT: " + (preview.department || ""));
    f("cert", "This certifies upon my honor that the foregoing is a record for services I rendered " +
              "to MSU-Iligan Institute of Technology during the month of " + monthLabel + ".");
    f("sig-name", preview.faculty_name || "");
    f("sig-desig", preview.designation || "");
    f("sig-head", preview.dept_head || "");
  }

  // ── Numbers and checks for the side panel ──────────────────────────────
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function fmtHours(n) { n = Math.round(n * 100) / 100; return (n % 1 === 0 ? n : n.toFixed(2).replace(/0$/, '')) + ''; }

  function computeStats(preview) {
    var s = {
      total: 0, cats: {}, worked: 0, related: 0, leave: 0, travel: 0, holiday: 0, weekend: 0,
      emptyWeekdays: []
    };
    CATS.forEach(function (c) { s.cats[c] = 0; });
    (preview.days || []).forEach(function (row) {
      if (row.type === "special") {
        if (row.day_class === "leave") s.leave++;
        else if (row.day_class === "travel") s.travel++;
        else if (row.day_class === "holiday") s.holiday++;
        else if (row.day_class === "weekend") s.weekend++;
        return;
      }
      s.total += num(row.total);
      CATS.forEach(function (c) {
        (row.cat_data[c] || []).forEach(function (e) { s.cats[c] += num(e.hrs); });
      });
      if (row.day_class === "related") s.related++;
      else if (num(row.total) > 0) s.worked++;
      else s.emptyWeekdays.push(row.day);
    });
    return s;
  }

  // ── Download (shared by the preview window and preview.html) ───────────
  function download(payload, btn, onDone) {
    var label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="pv-spin" aria-hidden="true"></span> Preparing…'; }
    function restore() { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
    try {
      var p = window.generateFdtr(payload, window.buildSpecialDays(payload));
      (p && typeof p.then === "function" ? p : Promise.resolve()).then(function () {
        restore();
        // Keep a copy so it can be downloaded again from the Generate page
        if (window.fdtrData) window.fdtrData.recordHistory(payload);
        if (onDone) onDone();
      }, function (err) {
        console.error(err);
        restore();
        alert("Sorry, the download didn’t work. Please try again.\n\nDetails: " + (err && err.message ? err.message : err));
      });
    } catch (err) {
      console.error(err);
      restore();
      alert("Sorry, the download didn’t work. Please try again.\n\nDetails: " + (err && err.message ? err.message : err));
    }
  }

  // ── PDF: the preview sheet as one Folio page ───────────────────────────
  // Loaded only when someone asks for a PDF (pinned versions from cdnjs)
  var PDF_LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ];
  var pdfLibsReady = null;
  function loadPdfLibs() {
    if (pdfLibsReady) return pdfLibsReady;
    pdfLibsReady = PDF_LIBS.reduce(function (chain, src) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var sc = document.createElement('script');
          sc.src = src;
          sc.onload = resolve;
          sc.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(sc);
        });
      });
    }, Promise.resolve());
    pdfLibsReady.catch(function () { pdfLibsReady = null; });   // allow a retry
    return pdfLibsReady;
  }

  function downloadPdf(payload, btn, onDone) {
    var label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="pv-spin" aria-hidden="true"></span> Preparing\u2026'; }
    function restore() { if (btn) { btn.disabled = false; btn.innerHTML = label; } }

    var preview = window.generatePreviewData(payload, window.buildSpecialDays(payload));
    // A fresh, unscaled sheet off-screen, in black and white like the printout
    var host = document.createElement('div');
    host.className = 'pv-pdf-host';
    document.body.appendChild(host);

    loadPdfLibs().then(function () {
      var sheet = mountSheet(host, preview);
      zoomSheet(sheet, 1);
      // One image per Folio page, in order: front, then back
      return sheet.papers.reduce(function (chain, paper) {
        return chain.then(function (list) {
          return window.html2canvas(paper, {
            scale: 3.125,                     // 816 px × 3.125 ≈ 300 dpi on 8.5 in
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
          }).then(function (canvas) { list.push(canvas); return list; });
        });
      }, Promise.resolve([]));
    }).then(function (canvases) {
      var JsPDF = window.jspdf.jsPDF;
      var pdf = new JsPDF({ orientation: 'portrait', unit: 'in', format: [8.5, 13], compress: true });
      canvases.forEach(function (canvas, i) {
        if (i > 0) pdf.addPage([8.5, 13], 'portrait');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 8.5, 13, undefined, 'FAST');
      });
      pdf.setProperties({
        title: 'FDTR ' + preview.month_name + ' ' + preview.year + ' \u2014 ' + preview.faculty_name,
        creator: 'FDTR Generator'
      });
      pdf.save('FDTR_' + preview.year + '_' + preview.month_name + '_' +
               String(preview.faculty_name).replace(/\s+/g, '_').replace(/,/g, '') + '.pdf');
      host.remove();
      restore();
      if (window.fdtrData) window.fdtrData.recordHistory(payload);
      if (onDone) onDone();
    }).catch(function (err) {
      console.error(err);
      host.remove();
      restore();
      alert("Sorry, the PDF couldn\u2019t be made. Check your internet connection and try again, " +
            "or use Print and choose \u201CSave as PDF\u201D.\n\nDetails: " + (err && err.message ? err.message : err));
    });
  }

  // ── Icons ──────────────────────────────────────────────────────────────
  var I = {
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    minus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    plus:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    fit:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    pdf:   '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/></svg>',
    dl:    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    edit:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    ok:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    warn:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  // ── Side panel ─────────────────────────────────────────────────────────
  function panelHtml(preview, s) {
    function check(ok, okText, badText) {
      return '<li class="' + (ok ? 'is-ok' : 'is-warn') + '">' + (ok ? I.ok : I.warn) +
             '<span>' + (ok ? okText : badText) + '</span></li>';
    }
    var catRows = CATS.filter(function (c) { return s.cats[c] > 0; }).map(function (c) {
      return '<div class="pv-row"><span><i class="pv-dot pv-dot-' + c + '"></i>' + CAT_LABEL[c] +
             '</span><strong>' + fmtHours(s.cats[c]) + ' h</strong></div>';
    }).join('');

    var dayBits = [
      [s.worked, 'with your schedule'], [s.related, 'suspended classes'],
      [s.leave, 'on leave'], [s.travel, 'on travel'], [s.holiday, 'holiday']
    ].filter(function (x) { return x[0] > 0; }).map(function (x) {
      return '<div class="pv-row"><span>' + x[1].charAt(0).toUpperCase() + x[1].slice(1) +
             '</span><strong>' + x[0] + ' day' + (x[0] === 1 ? '' : 's') + '</strong></div>';
    }).join('');

    var empty = s.emptyWeekdays;
    return (
      '<section class="pv-card pv-total">' +
        '<div class="pv-total-label">Total hours</div>' +
        '<div class="pv-total-num">' + fmtHours(s.total) + '</div>' +
        '<div class="pv-total-sub">' + escHtml(preview.month_name + ' ' + preview.year) + '</div>' +
      '</section>' +
      (catRows ? '<section class="pv-card"><h3>Hours by type</h3>' + catRows + '</section>' : '') +
      (dayBits ? '<section class="pv-card"><h3>Days</h3>' + dayBits + '</section>' : '') +
      '<section class="pv-card"><h3>Before you download</h3><ul class="pv-checks">' +
        check(!!preview.faculty_name, 'Name: ' + escHtml(preview.faculty_name), 'Your name is missing') +
        check(!!preview.designation, 'Position: ' + escHtml(preview.designation), 'Your position is missing') +
        check(!!preview.department, 'Department: ' + escHtml(preview.department), 'Your department is missing') +
        check(!!preview.dept_head, 'Signed by: ' + escHtml(preview.dept_head), 'Department head is missing') +
        (empty.length
          ? check(false, '', empty.length + ' weekday' + (empty.length === 1 ? ' has' : 's have') +
                  ' no hours (day ' + empty.slice(0, 6).join(', ') + (empty.length > 6 ? '…' : '') +
                  '). Add blocks for that weekday in Setup if that’s wrong.')
          : check(true, 'Every weekday has hours or a reason', '')) +
      '</ul></section>' +
      '<section class="pv-card pv-legend"><h3>Colours on the page</h3>' +
        '<span class="legend-item legend-regular">Regular day</span>' +
        '<span class="legend-item legend-related">Suspended classes</span>' +
        '<span class="legend-item legend-weekend">Weekend</span>' +
        '<span class="legend-item legend-holiday">Holiday</span>' +
        '<span class="legend-item legend-leave">Leave</span>' +
        '<span class="legend-item legend-travel">Travel</span>' +
        '<p>Colours only help you check. The downloaded Excel file is plain black and white.</p>' +
      '</section>'
    );
  }

  // ── Preview window ─────────────────────────────────────────────────────
  var modal = null, lastFocus = null, zoom = 1, fitMode = true, curSheet = null;

  function open(payload, opts) {
    opts = opts || {};
    var preview = window.generatePreviewData(payload, window.buildSpecialDays(payload));
    var stats = computeStats(preview);
    var monthLabel = preview.month_name + ' ' + preview.year;
    close();
    lastFocus = document.activeElement;

    modal = document.createElement('div');
    modal.className = 'pv-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'pv-title');
    modal.innerHTML =
      '<div class="pv-shell">' +
        '<header class="pv-head">' +
          '<div class="pv-head-title">' +
            '<h2 id="pv-title">Check your FDTR</h2>' +
            '<span>' + escHtml(monthLabel) + ' \u00B7 ' + escHtml(preview.faculty_name) +
              ' \u00B7 <span class="pv-paper-note">Folio, back to back</span></span>' +
          '</div>' +
          '<div class="pv-zoom" role="group" aria-label="Zoom">' +
            '<button type="button" data-z="out" aria-label="Zoom out">' + I.minus + '</button>' +
            '<span class="pv-zoom-val" aria-live="polite">100%</span>' +
            '<button type="button" data-z="in" aria-label="Zoom in">' + I.plus + '</button>' +
            '<button type="button" data-z="fit" class="pv-fit" title="Fit the page to the window">' + I.fit + '<span>Fit</span></button>' +
          '</div>' +
          '<button type="button" class="pv-close" aria-label="Close preview">' + I.close + '</button>' +
        '</header>' +
        '<div class="pv-body">' +
          '<div class="pv-canvas" tabindex="0" aria-label="FDTR page preview">' +

          '</div>' +
          '<aside class="pv-side">' +
            '<div class="pv-side-scroll">' + panelHtml(preview, stats) + '</div>' +
            '<div class="pv-actions">' +
              '<p class="pv-done" hidden>' + I.ok + '<span>Downloaded. It’s also in <strong>Past records</strong>.</span></p>' +
              '<div class="pv-dl-row">' +
                '<button type="button" class="btn btn-primary pv-download">' + I.dl + ' Excel</button>' +
                '<button type="button" class="btn btn-primary pv-download-pdf">' + I.pdf + ' PDF</button>' +
              '</div>' +
              '<div class="pv-actions-row">' +
                '<button type="button" class="btn btn-secondary pv-print">' + I.print + ' Print</button>' +
                '<button type="button" class="btn btn-secondary pv-edit">' + I.edit + ' Make changes</button>' +
              '</div>' +
            '</div>' +
          '</aside>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    document.body.classList.add('pv-open');

    var sheet = mountSheet(modal.querySelector('.pv-canvas'), preview);
    curSheet = sheet;
    modal.querySelector('.pv-paper-note').textContent =
      'Folio, 2 pages back to back' + (sheet.scale < 0.995 ? ' (printed at ' + Math.round(sheet.scale * 100) + '% size)' : '');

    // Buttons
    modal.querySelector('.pv-close').addEventListener('click', close);
    modal.querySelector('.pv-edit').addEventListener('click', close);
    modal.querySelector('.pv-print').addEventListener('click', function () { window.print(); });
    window.addEventListener('afterprint', onAfterPrint);
    function downloaded() {
      modal.querySelector('.pv-done').hidden = false;
      if (opts.onDownloaded) opts.onDownloaded();
    }
    modal.querySelector('.pv-download').addEventListener('click', function () {
      download(payload, this, downloaded);
    });
    modal.querySelector('.pv-download-pdf').addEventListener('click', function () {
      downloadPdf(payload, this, downloaded);
    });
    modal.querySelector('.pv-zoom').addEventListener('click', function (e) {
      var b = e.target.closest('[data-z]');
      if (!b) return;
      var z = b.getAttribute('data-z');
      if (z === 'fit') { fitMode = true; applyZoom(); return; }
      fitMode = false;
      zoom = Math.max(0.4, Math.min(2, Math.round((zoom + (z === 'in' ? 0.1 : -0.1)) * 10) / 10));
      applyZoom();
    });
    // Click / tap the page: zoom to 100% at that spot, again to fit the window
    sheet.papers.forEach(function (paperEl) { paperEl.addEventListener('click', function (e) {
      var canvas = modal.querySelector('.pv-canvas');
      var rect = this.getBoundingClientRect();
      var fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      var cx = e.clientX - canvas.getBoundingClientRect().left, cy = e.clientY - canvas.getBoundingClientRect().top;
      if (fitMode || zoom < 0.95) { fitMode = false; zoom = 1; } else { fitMode = true; }
      applyZoom();
      // keep the tapped spot under the finger/cursor
      var r2 = this.getBoundingClientRect(), c2 = canvas.getBoundingClientRect();
      canvas.scrollLeft += (r2.left - c2.left + fx * r2.width) - cx;
      if (window.matchMedia('(max-width: 899px)').matches) {
        var body = modal.querySelector('.pv-body');
        body.scrollTop += (r2.top - c2.top + fy * r2.height) - cy;
      } else {
        canvas.scrollTop += (r2.top - c2.top + fy * r2.height) - cy;
      }
    }); });

    // Ctrl/⌘ + mouse wheel zooms the page instead of the whole browser
    modal.querySelector('.pv-canvas').addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      fitMode = false;
      zoom = Math.max(0.4, Math.min(2, zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
      applyZoom();
    }, { passive: false });

    modal.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    fitMode = true;
    applyZoom();
    modal.querySelector('.pv-download').focus({ preventScroll: true });
  }

  function onResize() { if (fitMode) applyZoom(); }

  // Print: the two sheets print at their real size (see the print styles)
  function onAfterPrint() {
    if (modal) applyZoom();
  }

  // Scale the paper; the sizer reserves the scaled size so scrolling stays correct
  function applyZoom() {
    if (!modal || !curSheet) return;
    var canvas = modal.querySelector('.pv-canvas');
    if (fitMode) {
      var avail = canvas.clientWidth - (canvas.clientWidth < 600 ? 16 : 48);
      zoom = Math.max(0.3, Math.min(1.25, avail / PAPER_W));
    }
    zoomSheet(curSheet, zoom);
    modal.querySelector('.pv-zoom-val').textContent = Math.round(zoom * 100) + '%';
    modal.querySelector('.pv-fit').classList.toggle('is-active', fitMode);
    curSheet.papers.forEach(function (p) { p.classList.toggle('is-zoomed', !fitMode && zoom >= 0.95); });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); fitMode = false; zoom = Math.min(2, zoom + 0.1); applyZoom(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); fitMode = false; zoom = Math.max(0.4, zoom - 0.1); applyZoom(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); fitMode = true; applyZoom(); }
    if (e.key === 'Tab') {   // keep focus inside the preview
      var f = Array.prototype.filter.call(
        modal.querySelectorAll('button:not([disabled]), [tabindex="0"]'),
        function (x) { return x.offsetParent !== null; });
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  function close() {
    if (!modal) return;
    modal.remove();
    modal = null;
    document.body.classList.remove('pv-open');
    window.removeEventListener('resize', onResize);
    window.removeEventListener('afterprint', onAfterPrint);
    curSheet = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // ── preview.html (stand-alone page) ────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    var docEl = document.getElementById("fdtr-doc");
    if (!docEl) return;    // not the preview page

    var raw = null;
    try { raw = sessionStorage.getItem(LS_PREVIEW); } catch (e) {}
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) {}
    if (!parsed || !parsed.preview || !parsed.payload) {
      location.replace("generate.html");
      return;
    }

    var preview = parsed.preview;
    var sheet = mountSheet(docEl, preview);
    function fitWidth() {
      var z = Math.min(1.25, (docEl.clientWidth - 8) / PAPER_W);
      zoomSheet(sheet, z);
    }
    fitWidth();
    window.addEventListener('resize', fitWidth);
    window.addEventListener('afterprint', fitWidth);
    var monthLabel = (preview.month_name || "") + " " + (preview.year || "");
    var sub = document.getElementById("preview-title-sub");
    if (sub) sub.textContent = monthLabel + " — " + (preview.faculty_name || "");
    document.title = "Preview — " + monthLabel;

    document.querySelectorAll(".btn-download-fdtr").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        download(parsed.payload, btn);
      });
    });
  });

  window.fdtrPreview = { open: open, close: close, renderPage: renderPage };
})();
