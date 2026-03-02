"""
FDTR Monthly Generator — Flask Application (v2)
"""

import io
import json
import os
import calendar
from datetime import date, datetime, timedelta

from dotenv import load_dotenv
from flask import (
    Flask, render_template, request, session,
    redirect, url_for, send_file
)

from fdtr.generator import generate_fdtr, generate_preview_data

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LEAVE_TYPES = [
    "Vacation Leave",
    "Sick Leave",
    "Monetization",
    "Faculty Sick Leave",
    "Special Leave",
    "Compensatory Leave",
    "Study Leave",
    "Maternity Leave",
    "Paternity Leave",
    "Solo Parent Leave",
    "Special Leave for Women",
    "Special Emergency Leave",
    "AVAWC Leave",
    "Adoption Leave",
    "Rehabilitation Leave",
    "Sabbatical Leave",
    "Wellness Leave",
]

MONTH_NAMES = [
    (1, "January"), (2, "February"), (3, "March"),    (4, "April"),
    (5, "May"),     (6, "June"),     (7, "July"),     (8, "August"),
    (9, "September"),(10, "October"),(11, "November"),(12, "December"),
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    if "faculty_name" in session:
        return redirect(url_for("generate"))
    return redirect(url_for("setup"))


@app.route("/setup", methods=["GET"])
def setup():
    schedule = session.get("weekly_schedule", _default_schedule())
    faculty  = {
        "faculty_name": session.get("faculty_name", ""),
        "designation":  session.get("designation", ""),
        "department":   session.get("department", ""),
        "dept_head":    session.get("dept_head", ""),
    }
    return render_template(
        "setup.html",
        faculty=faculty,
        schedule=schedule,
    )


@app.route("/save-setup", methods=["POST"])
def save_setup():
    # ── Faculty info ──────────────────────────────────────────────────────
    session["faculty_name"] = request.form.get("faculty_name", "").strip().upper()
    session["designation"]  = request.form.get("designation",  "").strip()
    session["department"]   = request.form.get("department",   "").strip().upper()
    session["dept_head"]    = request.form.get("dept_head",    "").strip().upper()

    # ── Weekly schedule — prefer JSON from calendar widget ────────────────
    schedule_json_str = request.form.get("schedule_json", "").strip()
    if schedule_json_str:
        try:
            sched = json.loads(schedule_json_str)
            # Ensure all weekday keys exist
            for day in ("monday", "tuesday", "wednesday", "thursday", "friday"):
                sched.setdefault(day, [])
            session["weekly_schedule"] = sched
        except (json.JSONDecodeError, ValueError):
            session["weekly_schedule"] = _default_schedule()
    else:
        # Legacy slot-based parsing (fallback)
        weekly_schedule = {}
        for day in ("monday", "tuesday", "wednesday", "thursday", "friday"):
            slots = []
            time_ins   = request.form.getlist(f"schedule_{day}_time_in[]")
            time_outs  = request.form.getlist(f"schedule_{day}_time_out[]")
            categories = request.form.getlist(f"schedule_{day}_category[]")
            labels     = request.form.getlist(f"schedule_{day}_label[]")
            for i in range(len(time_ins)):
                t_in  = (time_ins[i]   or "").strip()
                t_out = (time_outs[i]  or "").strip()
                cat   = (categories[i] if i < len(categories) else "others").strip()
                lbl   = (labels[i]     if i < len(labels)     else "").strip()
                if t_in and t_out:
                    slots.append({"time_in": t_in, "time_out": t_out,
                                  "category": cat, "label": lbl})
            weekly_schedule[day] = slots
        session["weekly_schedule"] = weekly_schedule

    session.modified = True
    return redirect(url_for("generate"))


@app.route("/generate", methods=["GET"])
def generate():
    if "faculty_name" not in session:
        return redirect(url_for("setup"))

    today = date.today()
    schedule_json = json.dumps(session.get("weekly_schedule", _default_schedule()))

    return render_template(
        "generate.html",
        faculty_name   = session.get("faculty_name", ""),
        designation    = session.get("designation", ""),
        department     = session.get("department", ""),
        dept_head      = session.get("dept_head", ""),
        schedule_json  = schedule_json,
        current_month  = today.month,
        current_year   = today.year,
        month_names    = MONTH_NAMES,
        years          = list(range(today.year - 1, today.year + 3)),
        leave_types    = LEAVE_TYPES,
    )


@app.route("/preview", methods=["POST"])
def preview():
    """Build preview data and render the interactive preview page."""
    # Faculty — session first, then hidden form fields from localStorage
    faculty_name = (session.get("faculty_name") or
                    request.form.get("hf_faculty_name", "")).strip().upper()
    designation  = (session.get("designation")  or
                    request.form.get("hf_designation", "")).strip()
    department   = (session.get("department")   or
                    request.form.get("hf_department", "")).strip().upper()
    dept_head    = (session.get("dept_head")    or
                    request.form.get("hf_dept_head", "")).strip().upper()

    if not faculty_name:
        return redirect(url_for("setup"))

    # Weekly schedule — session first, then JSON hidden field
    weekly_schedule = session.get("weekly_schedule")
    if not weekly_schedule:
        weekly_schedule = _parse_schedule_json(request.form.get("hf_schedule", ""))

    month = int(request.form.get("month", date.today().month))
    year  = int(request.form.get("year",  date.today().year))

    # Raw form arrays
    holiday_dates  = [s.strip() for s in request.form.getlist("holiday_date[]")]
    holiday_labels = [s.strip() for s in request.form.getlist("holiday_label[]")]
    leave_dates    = [s.strip() for s in request.form.getlist("leave_date[]")]
    leave_types_in = [s.strip() for s in request.form.getlist("leave_type[]")]
    travel_starts  = [s.strip() for s in request.form.getlist("travel_start[]")]
    travel_ends    = [s.strip() for s in request.form.getlist("travel_end[]")]
    travel_tas     = [s.strip() for s in request.form.getlist("travel_ta[]")]
    rel_starts     = [s.strip() for s in request.form.getlist("related_start[]")]
    rel_ends       = [s.strip() for s in request.form.getlist("related_end[]")]
    rel_time_ins   = [s.strip() for s in request.form.getlist("related_time_in[]")]
    rel_time_outs  = [s.strip() for s in request.form.getlist("related_time_out[]")]

    special_days = _build_special_days(
        holiday_dates, holiday_labels,
        leave_dates, leave_types_in,
        travel_starts, travel_ends, travel_tas,
        rel_starts, rel_ends, rel_time_ins, rel_time_outs,
        weekly_schedule=weekly_schedule,
    )

    prev = generate_preview_data(
        faculty_name    = faculty_name,
        designation     = designation,
        department      = department,
        dept_head       = dept_head,
        month           = month,
        year            = year,
        weekly_schedule = weekly_schedule,
        special_days    = special_days,
    )

    # Pass all raw data so preview.html can re-submit for download
    form_data = {
        "month":          month,
        "year":           year,
        "faculty_name":   faculty_name,
        "designation":    designation,
        "department":     department,
        "dept_head":      dept_head,
        "schedule_json":  json.dumps(weekly_schedule),
        "holiday_dates":  holiday_dates,
        "holiday_labels": holiday_labels,
        "leave_dates":    leave_dates,
        "leave_types":    leave_types_in,
        "travel_starts":  travel_starts,
        "travel_ends":    travel_ends,
        "travel_tas":     travel_tas,
        "rel_starts":     rel_starts,
        "rel_ends":       rel_ends,
        "rel_time_ins":   rel_time_ins,
        "rel_time_outs":  rel_time_outs,
    }

    return render_template("preview.html", preview=prev, form_data=form_data)


@app.route("/download", methods=["POST"])
def download():
    # Faculty — session first, then hidden fields
    faculty_name = (session.get("faculty_name") or
                    request.form.get("hf_faculty_name", "")).strip().upper()
    designation  = (session.get("designation")  or
                    request.form.get("hf_designation", "")).strip()
    department   = (session.get("department")   or
                    request.form.get("hf_department", "")).strip().upper()
    dept_head    = (session.get("dept_head")    or
                    request.form.get("hf_dept_head", "")).strip().upper()

    if not faculty_name:
        return redirect(url_for("setup"))

    weekly_schedule = session.get("weekly_schedule")
    if not weekly_schedule:
        weekly_schedule = _parse_schedule_json(request.form.get("hf_schedule", ""))

    month = int(request.form.get("month", date.today().month))
    year  = int(request.form.get("year",  date.today().year))

    holiday_dates  = [s.strip() for s in request.form.getlist("holiday_date[]")]
    holiday_labels = [s.strip() for s in request.form.getlist("holiday_label[]")]
    leave_dates    = [s.strip() for s in request.form.getlist("leave_date[]")]
    leave_types_in = [s.strip() for s in request.form.getlist("leave_type[]")]
    travel_starts  = [s.strip() for s in request.form.getlist("travel_start[]")]
    travel_ends    = [s.strip() for s in request.form.getlist("travel_end[]")]
    travel_tas     = [s.strip() for s in request.form.getlist("travel_ta[]")]
    rel_starts     = [s.strip() for s in request.form.getlist("related_start[]")]
    rel_ends       = [s.strip() for s in request.form.getlist("related_end[]")]
    rel_time_ins   = [s.strip() for s in request.form.getlist("related_time_in[]")]
    rel_time_outs  = [s.strip() for s in request.form.getlist("related_time_out[]")]

    special_days = _build_special_days(
        holiday_dates, holiday_labels,
        leave_dates, leave_types_in,
        travel_starts, travel_ends, travel_tas,
        rel_starts, rel_ends, rel_time_ins, rel_time_outs,
        weekly_schedule=weekly_schedule,
    )

    excel_bytes = generate_fdtr(
        faculty_name    = faculty_name,
        designation     = designation,
        department      = department,
        dept_head       = dept_head,
        month           = month,
        year            = year,
        weekly_schedule = weekly_schedule,
        special_days    = special_days,
    )

    month_name = dict(MONTH_NAMES)[month]
    filename   = (f"FDTR_{year}_{month_name}_"
                  f"{faculty_name.replace(' ', '_').replace(',', '')}.xlsx")

    return send_file(
        io.BytesIO(excel_bytes),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/reset")
def reset():
    session.clear()
    return redirect(url_for("setup"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_schedule_json(raw: str) -> dict:
    """Parse schedule JSON string, return default on error."""
    if not raw:
        return _default_schedule()
    try:
        sched = json.loads(raw)
        for day in ("monday", "tuesday", "wednesday", "thursday", "friday"):
            sched.setdefault(day, [])
        return sched
    except (json.JSONDecodeError, ValueError):
        return _default_schedule()


_WEEKDAY_KEYS = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
]


def _build_special_days(
    holiday_dates, holiday_labels,
    leave_dates, leave_types_in,
    travel_starts, travel_ends, travel_tas,
    rel_starts, rel_ends,
    rel_time_ins=None, rel_time_outs=None,
    weekly_schedule=None,
) -> dict:
    """Parse all special-day form arrays into {date_str: {type, label, …}} dict.

    weekly_schedule is used to decide whether to apply a related-activities
    entry on a weekend: if the weekend has no schedule blocks, it is left as a
    normal weekend (SATURDAY / SUNDAY) rather than being overridden.
    """
    special_days = {}
    sched = weekly_schedule or {}

    for d, lbl in zip(holiday_dates, holiday_labels):
        if d and lbl:
            special_days[d] = {"type": "holiday", "label": lbl.upper()}

    for d, lt in zip(leave_dates, leave_types_in):
        if d and lt:
            special_days[d] = {"type": "leave", "label": f"ON {lt.upper()}"}

    for start_str, end_str, ta in zip(travel_starts, travel_ends, travel_tas):
        if start_str and end_str and ta:
            try:
                start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
                end_d   = datetime.strptime(end_str,   "%Y-%m-%d").date()
                cur = start_d
                while cur <= end_d:
                    special_days[cur.strftime("%Y-%m-%d")] = {
                        "type": "travel", "label": f"ON TRAVEL, TA NO: {ta}",
                    }
                    cur += timedelta(days=1)
            except ValueError:
                pass

    for i, (start_str, end_str) in enumerate(zip(rel_starts, rel_ends)):
        if start_str and end_str:
            t_in  = rel_time_ins[i]  if rel_time_ins  and i < len(rel_time_ins)  else ""
            t_out = rel_time_outs[i] if rel_time_outs and i < len(rel_time_outs) else ""
            try:
                start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
                end_d   = datetime.strptime(end_str,   "%Y-%m-%d").date()
                cur = start_d
                while cur <= end_d:
                    weekday   = cur.weekday()          # 0=Mon … 6=Sun
                    day_key   = _WEEKDAY_KEYS[weekday]
                    is_weekend = weekday >= 5          # Sat=5, Sun=6

                    # Skip weekends that have no regular schedule blocks —
                    # they stay as plain SATURDAY / SUNDAY rows.
                    if is_weekend and not sched.get(day_key):
                        cur += timedelta(days=1)
                        continue

                    special_days[cur.strftime("%Y-%m-%d")] = {
                        "type":     "related_activities",
                        "label":    "",
                        "time_in":  t_in,
                        "time_out": t_out,
                    }
                    cur += timedelta(days=1)
            except ValueError:
                pass

    return special_days


def _default_schedule() -> dict:
    """Return a sensible default weekly schedule (Mon-Fri, 8-12 & 13-17 Others)."""
    slots = [
        {"time_in": "08:00", "time_out": "12:00", "category": "others", "label": ""},
        {"time_in": "13:00", "time_out": "17:00", "category": "others", "label": ""},
    ]
    return {day: list(slots)
            for day in ("monday", "tuesday", "wednesday", "thursday", "friday")}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=True, host="0.0.0.0", port=port)
