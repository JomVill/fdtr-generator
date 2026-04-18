/* ============================================================
   FDTR Excel Generator — static build (ExcelJS port)
   1:1 port of fdtr/generator.py.
   Depends on ExcelJS (window.ExcelJS) and FileSaver (window.saveAs).
   Public API:
     window.generatePreviewData(payload, specialDays)
     window.generateFdtr(payload, specialDays)   // triggers download
   ============================================================ */

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────────────────
  var INSTITUTION_LINES = [
    "Republic of the Philippines",
    "Mindanao State University",
    "ILIGAN INSTITUTE OF TECHNOLOGY",
    "Iligan City",
  ];

  var MONTH_ABBR = {
     1:"Jan",  2:"Feb",  3:"Mar",  4:"Apr",
     5:"May",  6:"Jun",  7:"Jul",  8:"Aug",
     9:"Sep", 10:"Oct", 11:"Nov", 12:"Dec",
  };

  var MONTH_FULL = {
     1:"January",   2:"February",  3:"March",    4:"April",
     5:"May",       6:"June",      7:"July",     8:"August",
     9:"September",10:"October",  11:"November",12:"December",
  };

  var WEEKDAY_NAMES = [
    "monday","tuesday","wednesday","thursday",
    "friday","saturday","sunday",
  ];

  // (time_in_col, time_out_col, hrs_col) — 1-indexed
  var CATEGORY_COLS = {
    class:              [2,  3,  4],   // B, C, D
    consultation:       [5,  6,  7],   // E, F, G
    related_activities: [8,  9, 10],   // H, I, J
    others:             [11, 12, 13],  // K, L, M
  };
  var CAT_ORDER = ["class","consultation","related_activities","others"];

  var TOTAL_COL = 14, DAY_COL = 1;

  var DEFAULT_RELATED_SLOTS = [
    { time_in: "08:00", time_out: "12:00", category: "related_activities", label: "" },
    { time_in: "13:00", time_out: "17:00", category: "related_activities", label: "" },
  ];

  var COL_HEADER_ROW  = 10;
  var DATA_START_ROW  = 14;
  var SECTION2_HEADER = 63;
  var SECTION2_DATA   = 67;

  var TIME_FMT = "h:mm AM/PM";

  // ── Border helpers ───────────────────────────────────────────────────────
  function _B(l, r, t, b) {
    var border = {};
    if (l) border.left   = { style: "thin" };
    if (r) border.right  = { style: "thin" };
    if (t) border.top    = { style: "thin" };
    if (b) border.bottom = { style: "thin" };
    return border;
  }
  // Deep-clone border (ExcelJS shares styles by reference; clone per cell to be safe)
  function cloneBorder(b) {
    return JSON.parse(JSON.stringify(b));
  }

  var FULL = _B(true, true, true, true);
  var LR   = _B(true, true, false, false);
  var LRB  = _B(true, true, false, true);

  function _frame_3rows(ws, col, r0) {
    ws.getCell(r0,   col).border = cloneBorder(FULL);
    ws.getCell(r0+1, col).border = cloneBorder(LR);
    ws.getCell(r0+2, col).border = cloneBorder(LRB);
  }

  function _outline_merge_3rows(ws, r0, c0, c1) {
    // Top row
    ws.getCell(r0, c0).border = cloneBorder(FULL);
    for (var c = c0 + 1; c < c1; c++) {
      ws.getCell(r0, c).border = _B(false, false, true, false);
    }
    ws.getCell(r0, c1).border = _B(false, true, true, false);
    // Middle row
    ws.getCell(r0+1, c0).border = _B(true, false, false, false);
    ws.getCell(r0+1, c1).border = _B(false, true, false, false);
    // Bottom row
    ws.getCell(r0+2, c0).border = _B(true, false, false, true);
    for (var cc = c0 + 1; cc < c1; cc++) {
      ws.getCell(r0+2, cc).border = _B(false, false, false, true);
    }
    ws.getCell(r0+2, c1).border = _B(false, true, false, true);
  }

  function _outline_merge(ws, r0, r1, c0, c1) {
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        ws.getCell(r, c).border = _B(
          (c === c0),
          (c === c1),
          (r === r0),
          (r === r1)
        );
      }
    }
  }

  // ── Alignment / Font ─────────────────────────────────────────────────────
  var CENTER = { horizontal: "center", vertical: "middle", wrapText: true };
  var LEFT   = { horizontal: "left",   vertical: "middle", wrapText: true };

  function _font(size, bold, italic) {
    return {
      name: "Times New Roman",
      size: size == null ? 9 : size,
      bold: !!bold,
      italic: !!italic,
    };
  }

  // ── Cell helpers ─────────────────────────────────────────────────────────
  function _set(ws, row, col, value, font, align, border, fmt) {
    var cell = ws.getCell(row, col);
    if (value !== undefined && value !== null) cell.value = value;
    if (font)   cell.font      = font;
    if (align)  cell.alignment = align;
    if (border) cell.border    = border;
    if (fmt)    cell.numFmt    = fmt;
    return cell;
  }

  function _merge(ws, r0, r1, c0, c1, value, font, align, fmt) {
    ws.mergeCells(r0, c0, r1, c1);
    var cell = ws.getCell(r0, c0);
    if (value !== undefined && value !== null) cell.value = value;
    if (font)  cell.font      = font;
    if (align) cell.alignment = align;
    if (fmt)   cell.numFmt    = fmt;
    return cell;
  }

  function _merge_no_border(ws, r, c0, c1, value, font, align) {
    ws.mergeCells(r, c0, r, c1);
    var cell = ws.getCell(r, c0);
    if (value !== undefined && value !== null) cell.value = value;
    if (font)  cell.font      = font;
    if (align) cell.alignment = align;
    return cell;
  }

  // ── Time utilities ───────────────────────────────────────────────────────
  function _parse_time(t) {
    if (t == null) return null;
    if (typeof t === "object" && t.h != null) return t;
    if (typeof t === "string") {
      var parts = t.trim().split(":");
      if (parts.length !== 2) return null;
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return null;
      return { h: h, m: m };
    }
    return null;
  }

  function _hours(t_in, t_out) {
    if (!t_in || !t_out) return 0.0;
    var mins = (t_out.h * 60 + t_out.m) - (t_in.h * 60 + t_in.m);
    var h = Math.round((mins / 60) * 100) / 100;
    return (h === Math.floor(h)) ? Math.floor(h) : h;
  }

  // Time → Excel fraction of a day (so numFmt "h:mm AM/PM" displays correctly)
  function _timeToFrac(t) {
    return (t.h * 60 + t.m) / (24 * 60);
  }

  function _fmt12(t) {
    if (!t) return "";
    var h = t.h, m = t.m;
    var ampm = h < 12 ? "AM" : "PM";
    var h12  = (h % 12) || 12;
    var mm   = (m < 10) ? "0" + m : "" + m;
    return h12 + ":" + mm + " " + ampm;
  }

  // ── Row address ──────────────────────────────────────────────────────────
  function _day_row(day) {
    return (day <= 15)
      ? DATA_START_ROW + (day - 1) * 3
      : SECTION2_DATA + (day - 16) * 3;
  }

  // ── Institution header ───────────────────────────────────────────────────
  function _write_institution_header(ws, month, year, faculty_name, department) {
    for (var i = 0; i < INSTITUTION_LINES.length; i++) {
      var rowNum = i + 1;
      _merge_no_border(
        ws, rowNum, 1, 14, INSTITUTION_LINES[i],
        _font(10, rowNum === 2 || rowNum === 3), CENTER
      );
    }
    _merge_no_border(ws, 5, 1, 14);
    _merge_no_border(ws, 6, 1, 14,
      "FACULTY DAILY TIME RECORD",
      _font(13, true), CENTER
    );
    _merge_no_border(ws, 7, 1, 14,
      "For the month of " + MONTH_FULL[month] + " " + year,
      _font(10), CENTER
    );
    _merge_no_border(ws, 8, 1, 14);

    // Row 9: name (A-H) | department (I-N)
    _outline_merge(ws, 9, 9, 1, 8);
    _merge(ws, 9, 9, 1, 8,
      "NAME: " + faculty_name, _font(9, true), LEFT);
    _outline_merge(ws, 9, 9, 9, 14);
    _merge(ws, 9, 9, 9, 14,
      "DEPARTMENT: " + department, _font(9, true), LEFT);
  }

  // ── Column header block ──────────────────────────────────────────────────
  function _write_col_headers(ws, start_row) {
    var r  = start_row;
    var bf = _font(9, true);
    var sf = _font(8);

    _outline_merge(ws, r, r+3, 1, 1);
    _merge(ws, r, r+3, 1, 1, "DAY", bf, CENTER);

    _outline_merge(ws, r, r, 2, 4);
    _merge(ws, r, r, 2, 4, "CLASS", bf, CENTER);

    _outline_merge(ws, r, r, 5, 7);
    _merge(ws, r, r, 5, 7, "CONSULTATION", bf, CENTER);

    _outline_merge(ws, r, r+1, 8, 10);
    _merge(ws, r, r+1, 8, 10, "RELATED\nACTIVITIES", bf, CENTER);

    _outline_merge(ws, r, r+1, 11, 13);
    _merge(ws, r, r+1, 11, 13, "OTHERS\n(Adm., R&E)", bf, CENTER);

    _outline_merge(ws, r, r+3, 14, 14);
    _merge(ws, r, r+3, 14, 14, "Total\nHours", bf, CENTER);

    _outline_merge(ws, r+1, r+1, 2, 4);
    _merge(ws, r+1, r+1, 2, 4, null, bf, CENTER);

    _outline_merge(ws, r+1, r+1, 5, 7);
    _merge(ws, r+1, r+1, 5, 7, null, bf, CENTER);

    var starts = [2, 5, 8, 11];
    for (var si = 0; si < starts.length; si++) {
      var c_start = starts[si];
      _set(ws, r+2, c_start,   "Time In",  sf, CENTER, cloneBorder(FULL));
      _set(ws, r+2, c_start+1, "Time Out", sf, CENTER, cloneBorder(FULL));
      _set(ws, r+2, c_start+2, "Hrs",      sf, CENTER, cloneBorder(FULL));
    }
    for (var sj = 0; sj < starts.length; sj++) {
      var c2 = starts[sj];
      _set(ws, r+3, c2,   "In",  sf, CENTER, cloneBorder(FULL));
      _set(ws, r+3, c2+1, "Out", sf, CENTER, cloneBorder(FULL));
      _set(ws, r+3, c2+2, null,  sf, CENTER, cloneBorder(FULL));
    }
  }

  // ── Special day (weekend / holiday / leave / travel) ─────────────────────
  function _write_special_day(ws, base_row, day_num, label, total_value) {
    var r0 = base_row;

    // A : day number
    _frame_3rows(ws, 1, r0);
    _merge(ws, r0, r0+2, 1, 1, day_num, _font(9, true), CENTER);

    // B–M : label
    _outline_merge_3rows(ws, r0, 2, 13);
    _merge(ws, r0, r0+2, 2, 13, label, _font(9, true, true), CENTER);

    // N : total
    _frame_3rows(ws, 14, r0);
    _merge(ws, r0, r0+2, 14, 14, total_value, _font(9, true), CENTER);
  }

  // ── Regular workday ──────────────────────────────────────────────────────
  function _write_regular_day(ws, base_row, day_num, slots, force_category) {
    var r0 = base_row;

    // A : day number
    _frame_3rows(ws, 1, r0);
    _merge(ws, r0, r0+2, 1, 1, day_num, _font(9, true), CENTER);

    // B–M : individual cells, FULL thin border on all 3 sub-rows
    for (var ro = 0; ro < 3; ro++) {
      var r = r0 + ro;
      for (var col = 2; col < 14; col++) {
        ws.getCell(r, col).border = cloneBorder(FULL);
      }
    }

    // Organise slots by category
    var cat_data = { class: [], consultation: [], related_activities: [], others: [] };
    var total_hours = 0.0;

    (slots || []).forEach(function (slot) {
      var cat = force_category || (slot && slot.category) || "others";
      if (!(cat in cat_data)) cat = "others";
      var t_in  = _parse_time(slot && slot.time_in);
      var t_out = _parse_time(slot && slot.time_out);
      var hrs   = _hours(t_in, t_out);
      total_hours += hrs;
      cat_data[cat].push({ t_in: t_in, t_out: t_out, hrs: hrs });
    });

    CAT_ORDER.forEach(function (cat) {
      var cols = CATEGORY_COLS[cat];
      var entries = cat_data[cat].slice(0, 2);
      entries.forEach(function (e, sub_i) {
        var r = r0 + sub_i;
        if (e.t_in) {
          _set(ws, r, cols[0], _timeToFrac(e.t_in), _font(9), CENTER, null, TIME_FMT);
        }
        if (e.t_out) {
          _set(ws, r, cols[1], _timeToFrac(e.t_out), _font(9), CENTER, null, TIME_FMT);
        }
        if (e.hrs) {
          _set(ws, r, cols[2], e.hrs, _font(9), CENTER);
        }
      });
    });

    // N : total hours (3-row merge)
    var total_val = null;
    if (total_hours > 0) {
      total_val = (total_hours === Math.floor(total_hours))
        ? Math.floor(total_hours)
        : Math.round(total_hours * 100) / 100;
    }
    _frame_3rows(ws, 14, r0);
    _merge(ws, r0, r0+2, 14, 14, total_val, _font(9, true), CENTER);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  function _write_footer(ws, faculty_name, designation, dept_head, month, year) {
    var r = SECTION2_DATA + 16 * 3;   // row 115

    var cert1 = "This certifies upon my honor that the foregoing is a record " +
                "for services I rendered to MSU-Iligan Institute";
    var cert2 = "of Technology during the month of " + MONTH_FULL[month] + " " + year + ".";

    _merge(ws, r,   r,   1, 14, cert1, _font(8), LEFT);
    _merge(ws, r+1, r+1, 1, 14, cert2, _font(8), LEFT);
    _merge(ws, r+2, r+2, 10, 13, "Certified Correct:", _font(8, true), LEFT);

    var sig = r + 5;
    _merge(ws, sig,   sig,   2, 6, faculty_name,                    _font(9, true), CENTER);
    _merge(ws, sig+1, sig+1, 2, 6, "(Signature over printed name)", _font(8),       CENTER);
    _merge(ws, sig+2, sig+2, 2, 6, designation,                     _font(8),       CENTER);
    _merge(ws, sig+3, sig+3, 2, 6, "(Designation)",                 _font(8),       CENTER);

    _merge(ws, sig,   sig,   9, 13, dept_head,                          _font(9, true), CENTER);
    _merge(ws, sig+1, sig+1, 9, 13, "           (Head of Dept./Unit)",  _font(8),       CENTER);
  }

  // ── Column widths & row heights ──────────────────────────────────────────
  function _set_column_widths(ws) {
    ws.getColumn("A").width = 5.0;
    ["B","C","E","F","H","I","K","L"].forEach(function (c) {
      ws.getColumn(c).width = 9.0;
    });
    ["D","G","J","M"].forEach(function (c) {
      ws.getColumn(c).width = 5.0;
    });
    ws.getColumn("N").width = 6.0;
  }

  function _set_row_heights(ws, days_in_month) {
    for (var r = 1; r <= 9; r++) ws.getRow(r).height = 14.0;
    ws.getRow(6).height = 18.0;

    [COL_HEADER_ROW, SECTION2_HEADER].forEach(function (block) {
      for (var o = 0; o < 4; o++) ws.getRow(block + o).height = 13.0;
    });

    for (var day = 1; day <= days_in_month; day++) {
      var r0 = _day_row(day);
      ws.getRow(r0).height   = 14.0;
      ws.getRow(r0+1).height = 14.0;
      ws.getRow(r0+2).height = 14.0;
    }
  }

  // ── Days in month (matches calendar.monthrange) ──────────────────────────
  function _daysInMonth(year, month) {
    // JS new Date(y, m, 0) → last day of the (m-1)-th month. For month 1-12 we want
    // day 0 of month → last day of previous. So (year, month, 0) returns last day of `month`.
    return new Date(year, month, 0).getDate();
  }

  // ── Preview-data helpers ─────────────────────────────────────────────────
  function _build_preview_regular(day, day_date, slots, force_category) {
    var cat_data = { class: [], consultation: [], related_activities: [], others: [] };
    var total_hours = 0.0;

    (slots || []).forEach(function (slot) {
      var cat = force_category || (slot && slot.category) || "others";
      if (!(cat in cat_data)) cat = "others";
      var t_in  = _parse_time(slot && slot.time_in);
      var t_out = _parse_time(slot && slot.time_out);
      var hrs   = _hours(t_in, t_out);
      total_hours += hrs;
      var hrsDisplay;
      if (!hrs) {
        hrsDisplay = "";
      } else {
        hrsDisplay = (hrs === Math.floor(hrs)) ? Math.floor(hrs) : Math.round(hrs * 100) / 100;
      }
      cat_data[cat].push({
        in:  _fmt12(t_in),
        out: _fmt12(t_out),
        hrs: hrsDisplay,
      });
    });

    var total_val = "";
    if (total_hours > 0) {
      total_val = (total_hours === Math.floor(total_hours))
        ? Math.floor(total_hours)
        : Math.round(total_hours * 100) / 100;
    }
    var day_class = force_category === "related_activities" ? "related" : "regular";
    return {
      day:       day,
      date:      day_date,
      type:      "regular",
      day_class: day_class,
      cat_data:  cat_data,
      cats:      CAT_ORDER.slice(),
      total:     total_val,
    };
  }

  // ── Public: generatePreviewData ──────────────────────────────────────────
  window.generatePreviewData = function (payload, special_days) {
    var profile = payload.profile || {};
    var month   = payload.month;
    var year    = payload.year;
    var weekly_schedule = payload.schedule || {};

    var days_in_month = _daysInMonth(year, month);
    var rows = [];

    for (var d = 1; d <= days_in_month; d++) {
      var day_date = new Date(year, month - 1, d);
      var date_str =
        year + "-" +
        (month < 10 ? "0" + month : month) + "-" +
        (d < 10 ? "0" + d : d);
      var jsDay  = day_date.getDay();   // 0=Sun..6=Sat
      var weekday = (jsDay + 6) % 7;    // 0=Mon..6=Sun

      if (special_days && Object.prototype.hasOwnProperty.call(special_days, date_str)) {
        var entry = special_days[date_str];
        var day_type = entry.type;
        var label    = entry.label || "";

        if (day_type === "related_activities") {
          var custom_in  = (entry.time_in  || "").trim();
          var custom_out = (entry.time_out || "").trim();
          var slots = (custom_in && custom_out)
            ? [{ time_in: custom_in, time_out: custom_out, category: "related_activities", label: "" }]
            : DEFAULT_RELATED_SLOTS;
          rows.push(_build_preview_regular(d, day_date, slots, "related_activities"));
        } else if (day_type === "leave" || day_type === "travel") {
          rows.push({ day: d, date: day_date, type: "special",
                      label: label, total: 0, day_class: day_type });
        } else {  // holiday
          rows.push({ day: d, date: day_date, type: "special",
                      label: label, total: null, day_class: "holiday" });
        }
      } else if (weekday === 5) {
        rows.push({ day: d, date: day_date, type: "special",
                    label: "SATURDAY", total: null, day_class: "weekend" });
      } else if (weekday === 6) {
        rows.push({ day: d, date: day_date, type: "special",
                    label: "SUNDAY", total: null, day_class: "weekend" });
      } else {
        var weekday_name = WEEKDAY_NAMES[weekday];
        var slots2 = weekly_schedule[weekday_name] || [];
        rows.push(_build_preview_regular(d, day_date, slots2));
      }
    }

    return {
      faculty_name: profile.faculty_name || "",
      designation:  profile.designation  || "",
      department:   profile.department   || "",
      dept_head:    profile.dept_head    || "",
      month:        month,
      month_name:   MONTH_FULL[month],
      year:         year,
      days:         rows,
    };
  };

  // ── Public: generateFdtr — builds workbook and triggers download ─────────
  window.generateFdtr = function (payload, special_days) {
    var profile = payload.profile || {};
    var faculty_name = profile.faculty_name || "";
    var designation  = profile.designation  || "";
    var department   = profile.department   || "";
    var dept_head    = profile.dept_head    || "";
    var month        = payload.month;
    var year         = payload.year;
    var weekly_schedule = payload.schedule || {};

    if (typeof ExcelJS === "undefined") {
      throw new Error("ExcelJS library not loaded");
    }
    if (typeof saveAs === "undefined") {
      throw new Error("FileSaver library not loaded");
    }

    var wb = new ExcelJS.Workbook();
    wb.creator = "FDTR Generator";
    var ws = wb.addWorksheet(MONTH_ABBR[month] + " " + year);

    // ── Institution header ────────────────────────────────────────────────
    _write_institution_header(ws, month, year, faculty_name, department);

    // ── Column header blocks ──────────────────────────────────────────────
    _write_col_headers(ws, COL_HEADER_ROW);
    _write_col_headers(ws, SECTION2_HEADER);

    // ── Day rows ──────────────────────────────────────────────────────────
    var days_in_month = _daysInMonth(year, month);

    for (var d = 1; d <= days_in_month; d++) {
      var base_row = _day_row(d);
      var day_date = new Date(year, month - 1, d);
      var date_str =
        year + "-" +
        (month < 10 ? "0" + month : month) + "-" +
        (d < 10 ? "0" + d : d);
      var jsDay   = day_date.getDay();
      var weekday = (jsDay + 6) % 7;

      if (special_days && Object.prototype.hasOwnProperty.call(special_days, date_str)) {
        var entry = special_days[date_str];
        var day_type = entry.type;
        var label    = entry.label || "";

        if (day_type === "related_activities") {
          var custom_in  = (entry.time_in  || "").trim();
          var custom_out = (entry.time_out || "").trim();
          var slots = (custom_in && custom_out)
            ? [{ time_in: custom_in, time_out: custom_out, category: "related_activities", label: "" }]
            : DEFAULT_RELATED_SLOTS;
          _write_regular_day(ws, base_row, d, slots, "related_activities");
        } else if (day_type === "leave" || day_type === "travel") {
          _write_special_day(ws, base_row, d, label, 0);
        } else {
          _write_special_day(ws, base_row, d, label, null);
        }
      } else if (weekday === 5) {
        _write_special_day(ws, base_row, d, "SATURDAY", null);
      } else if (weekday === 6) {
        _write_special_day(ws, base_row, d, "SUNDAY", null);
      } else {
        var weekday_name = WEEKDAY_NAMES[weekday];
        var slots2 = weekly_schedule[weekday_name] || [];
        _write_regular_day(ws, base_row, d, slots2);
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────
    _write_footer(ws, faculty_name, designation, dept_head, month, year);

    // ── Formatting ────────────────────────────────────────────────────────
    _set_column_widths(ws);
    _set_row_heights(ws, days_in_month);

    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 13 }];
    ws.pageSetup = {
      paperSize: 5,                 // 5 = US Legal
      orientation: "portrait",
      fitToPage: true,
      printTitlesRow: "1:13",
    };

    // ── Serialize & download ──────────────────────────────────────────────
    var filename = "FDTR_" + year + "_" + MONTH_FULL[month] + "_" +
                   String(faculty_name).replace(/\s+/g, "_").replace(/,/g, "") + ".xlsx";

    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, filename);
      return filename;
    });
  };
})();
