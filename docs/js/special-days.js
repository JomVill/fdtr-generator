/* ============================================================
   FDTR Generator — Special Days builder (static build)
   Port of app.py::_build_special_days().
   Accepts the form payload produced by app.js::buildPayload()
   and returns a dict  { "YYYY-MM-DD": {type, label, time_in?, time_out?} }.
   ============================================================ */

(function () {
  "use strict";

  var WEEKDAY_KEYS = [
    'monday','tuesday','wednesday','thursday',
    'friday','saturday','sunday',
  ];

  function parseIsoDate(s) {
    // "YYYY-MM-DD" → Date (at local midnight to avoid TZ drift)
    if (!s) return null;
    var parts = String(s).split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10),
        m = parseInt(parts[1], 10),
        d = parseInt(parts[2], 10);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function toIso(dt) {
    var y = dt.getFullYear();
    var m = dt.getMonth() + 1;
    var d = dt.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }

  function weekdayKey(dt) {
    // JS: Sunday=0 … Saturday=6. Python: Monday=0 … Sunday=6.
    var jsDay = dt.getDay();
    return WEEKDAY_KEYS[(jsDay + 6) % 7];
  }

  function isWeekend(dt) {
    var jsDay = dt.getDay();
    return jsDay === 0 || jsDay === 6;
  }

  function addDay(dt) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
  }

  /**
   * @param  {object} payload from buildPayload() in app.js
   * @return {object} keyed by "YYYY-MM-DD"
   */
  window.buildSpecialDays = function (payload) {
    var out = {};
    var sched = (payload && payload.schedule) || {};

    // Holidays
    var hd = payload.holiday_dates || [];
    var hl = payload.holiday_labels || [];
    for (var i = 0; i < hd.length; i++) {
      var d = hd[i], lbl = hl[i];
      if (d && lbl) {
        out[d] = { type: 'holiday', label: String(lbl).toUpperCase() };
      }
    }

    // Leave days
    var ld = payload.leave_dates || [];
    var lt = payload.leave_types || [];
    for (var j = 0; j < ld.length; j++) {
      var dd = ld[j], ty = lt[j];
      if (dd && ty) {
        out[dd] = { type: 'leave', label: 'ON ' + String(ty).toUpperCase() };
      }
    }

    // Travel (date ranges, inclusive, all days marked)
    var ts = payload.travel_starts || [];
    var te = payload.travel_ends   || [];
    var tt = payload.travel_tas    || [];
    for (var k = 0; k < ts.length; k++) {
      var sd = parseIsoDate(ts[k]);
      var ed = parseIsoDate(te[k]);
      var ta = tt[k];
      if (!sd || !ed || !ta) continue;
      for (var cur = sd; cur.getTime() <= ed.getTime(); cur = addDay(cur)) {
        out[toIso(cur)] = {
          type:  'travel',
          label: 'ON TRAVEL, TA NO: ' + ta,
        };
      }
    }

    // Related activities / suspensions (inclusive range; weekend-skip rule)
    var rs = payload.rel_starts    || [];
    var re = payload.rel_ends      || [];
    var rin = payload.rel_time_ins || [];
    var rout = payload.rel_time_outs || [];
    for (var n = 0; n < rs.length; n++) {
      var rsd = parseIsoDate(rs[n]);
      var red = parseIsoDate(re[n]);
      if (!rsd || !red) continue;
      var t_in  = rin[n] || '';
      var t_out = rout[n] || '';
      for (var c = rsd; c.getTime() <= red.getTime(); c = addDay(c)) {
        // Skip weekends that have no scheduled blocks — they stay as plain SAT/SUN.
        if (isWeekend(c)) {
          var dayKey = weekdayKey(c);
          var blocks = sched[dayKey];
          if (!blocks || !blocks.length) continue;
        }
        out[toIso(c)] = {
          type:     'related_activities',
          label:    '',
          time_in:  t_in,
          time_out: t_out,
        };
      }
    }

    return out;
  };
})();
