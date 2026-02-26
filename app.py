"""
FDTR Monthly Generator — Flask Application
"""

import os
import calendar
from datetime import date, datetime, timedelta

from dotenv import load_dotenv
from flask import (
    Flask, render_template, request, session,
    redirect, url_for, send_file
)
import io

from fdtr.generator import generate_fdtr, generate_preview_data

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# ---------------------------------------------------------------------------
# Leave types (full list)
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

SCHEDULE_CATEGORIES = [
    ("class",              "Class"),
    ("consultation",       "Consultation"),
    ("related_activities", "Related Activities"),
    ("others",             "Others (Adm., R&E)"),
]

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

MONTH_NAMES = [
    (1, "January"), (2, "February"), (3, "March"), (4, "April"),
    (5, "May"), (6, "June"), (7, "July"), (8, "August"),
    (9, "September"), (10, "October"), (11, "November"), (12, "December"),
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
        weekdays=WEEKDAYS,
        categories=SCHEDULE_CATEGORIES,
    )


@app.route("/save-setup", methods=["POST"])
def save_setup():
    # Faculty info
    session["faculty_name"] = request.form.get("faculty_name", "").strip().upper()
    session["designation"]  = request.form.get("designation", "").strip()
    session["department"]   = request.form.get("department", "").strip().upper()
    session["dept_head"]    = request.form.get("dept_head", "").strip().upper()

    # Weekly schedule — collect from repeated form fields
    # Field names: schedule[monday][0][time_in], schedule[monday][0][time_out], etc.
    weekly_schedule = {}
    for day in ("monday", "tuesday", "wednesday", "thursday", "friday"):
        slots = []
        # The form sends arrays: schedule_<day>_time_in[], etc.
        time_ins   = request.form.getlist(f"schedule_{day}_time_in[]")
        time_outs  = request.form.getlist(f"schedule_{day}_time_out[]")
        categories = request.form.getlist(f"schedule_{day}_category[]")
        labels     = request.form.getlist(f"schedule_{day}_label[]")

        for i in range(len(time_ins)):
            t_in  = (time_ins[i]   or "").strip()
            t_out = (time_outs[i]  or "").strip()
            cat   = (categories[i] if i < len(categories) else "others").strip()
            lbl   = (labels[i]     if i < len(labels) else "").strip()
            if t_in and t_out:
                slots.append({
                    "time_in":  t_in,
                    "time_out": t_out,
                    "category": cat,
                    "label":    lbl,
                })
        weekly_schedule[day] = slots

    session["weekly_schedule"] = weekly_schedule
    session.modified = True
    return redirect(url_for("generate"))


@app.route("/generate", methods=["GET"])
def generate():
    if "faculty_name" not in session:
        return redirect(url_for("setup"))

    today = date.today()
    return render_template(
        "generate.html",
        faculty_name=session.get("faculty_name", ""),
        department=session.get("department", ""),
        current_month=today.month,
        current_year=today.year,
        month_names=MONTH_NAMES,
        years=list(range(today.year - 1, today.year + 3)),
        leave_types=LEAVE_TYPES,
    )


@app.route("/preview", methods=["POST"])
def preview():
    """Build preview data and render the interactive preview page."""
    if "faculty_name" not in session:
        return redirect(url_for("setup"))

    month = int(request.form.get("month", date.today().month))
    year  = int(request.form.get("year",  date.today().year))

    # Collect raw form arrays (kept for the hidden re-submit form in preview.html)
    holiday_dates  = [s.strip() for s in request.form.getlist("holiday_date[]")]
    holiday_labels = [s.strip() for s in request.form.getlist("holiday_label[]")]
    leave_dates    = [s.strip() for s in request.form.getlist("leave_date[]")]
    leave_types_in = [s.strip() for s in request.form.getlist("leave_type[]")]
    travel_starts  = [s.strip() for s in request.form.getlist("travel_start[]")]
    travel_ends    = [s.strip() for s in request.form.getlist("travel_end[]")]
    travel_tas     = [s.strip() for s in request.form.getlist("travel_ta[]")]
    rel_starts     = [s.strip() for s in request.form.getlist("related_start[]")]
    rel_ends       = [s.strip() for s in request.form.getlist("related_end[]")]

    special_days = _build_special_days(
        holiday_dates, holiday_labels,
        leave_dates, leave_types_in,
        travel_starts, travel_ends, travel_tas,
        rel_starts, rel_ends,
    )

    prev = generate_preview_data(
        faculty_name    = session["faculty_name"],
        designation     = session.get("designation", ""),
        department      = session.get("department", ""),
        dept_head       = session.get("dept_head", ""),
        month           = month,
        year            = year,
        weekly_schedule = session.get("weekly_schedule", _default_schedule()),
        special_days    = special_days,
    )

    form_data = {
        "month":          month,
        "year":           year,
        "holiday_dates":  holiday_dates,
        "holiday_labels": holiday_labels,
        "leave_dates":    leave_dates,
        "leave_types":    leave_types_in,
        "travel_starts":  travel_starts,
        "travel_ends":    travel_ends,
        "travel_tas":     travel_tas,
        "rel_starts":     rel_starts,
        "rel_ends":       rel_ends,
    }

    return render_template(
        "preview.html",
        preview   = prev,
        form_data = form_data,
    )


@app.route("/download", methods=["POST"])
def download():
    if "faculty_name" not in session:
        return redirect(url_for("setup"))

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

    special_days = _build_special_days(
        holiday_dates, holiday_labels,
        leave_dates, leave_types_in,
        travel_starts, travel_ends, travel_tas,
        rel_starts, rel_ends,
    )

    excel_bytes = generate_fdtr(
        faculty_name    = session["faculty_name"],
        designation     = session.get("designation", ""),
        department      = session.get("department", ""),
        dept_head       = session.get("dept_head", ""),
        month           = month,
        year            = year,
        weekly_schedule = session.get("weekly_schedule", _default_schedule()),
        special_days    = special_days,
    )

    month_name = dict(MONTH_NAMES)[month]
    filename   = (f"FDTR_{year}_{month_name}_"
                  f"{session['faculty_name'].replace(' ', '_').replace(',', '')}.xlsx")

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

def _build_special_days(
    holiday_dates, holiday_labels,
    leave_dates, leave_types_in,
    travel_starts, travel_ends, travel_tas,
    rel_starts, rel_ends,
) -> dict:
    """Parse all special-day form arrays into a {date_str: {type, label}} dict."""
    special_days = {}

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

    for start_str, end_str in zip(rel_starts, rel_ends):
        if start_str and end_str:
            try:
                start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
                end_d   = datetime.strptime(end_str,   "%Y-%m-%d").date()
                cur = start_d
                while cur <= end_d:
                    special_days[cur.strftime("%Y-%m-%d")] = {
                        "type": "related_activities", "label": "",
                    }
                    cur += timedelta(days=1)
            except ValueError:
                pass

    return special_days


def _default_schedule() -> dict:
    """Return a default weekly schedule (Mon-Fri 8-12, 13-17 Others)."""
    slots = [
        {"time_in": "08:00", "time_out": "12:00", "category": "others", "label": ""},
        {"time_in": "13:00", "time_out": "17:00", "category": "others", "label": ""},
    ]
    return {day: list(slots) for day in ("monday", "tuesday", "wednesday", "thursday", "friday")}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=True, port=port)
