"""
FastAPI server — serves Garmin activity data from SQLite to the React frontend.

Run:
    uvicorn api:app --reload --port 8001
"""
from datetime import datetime, timedelta
from collections import defaultdict

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from db import get_conn, init_db

app = FastAPI(title="Garmin Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


def ms_to_pace(avg_speed_ms):
    """Convert m/s to min/km string, e.g. '5:23'."""
    if not avg_speed_ms or avg_speed_ms <= 0:
        return None
    secs_per_km = 1000 / avg_speed_ms
    mins = int(secs_per_km // 60)
    secs = int(secs_per_km % 60)
    return f"{mins}:{secs:02d}"


def ms_to_pace_float(avg_speed_ms):
    """Convert m/s to decimal minutes per km (for charting)."""
    if not avg_speed_ms or avg_speed_ms <= 0:
        return None
    return round(1000 / avg_speed_ms / 60, 4)


def row_to_dict(row):
    return dict(row)


# ── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/api/activities")
def get_activities(limit: int = Query(200, le=1000)):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM activities
        WHERE distance_m IS NOT NULL AND distance_m > 0
        ORDER BY start_time DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = row_to_dict(r)
        d["distance_km"] = round(d["distance_m"] / 1000, 2) if d["distance_m"] else None
        d["pace"] = ms_to_pace(d["avg_speed_ms"])
        d["pace_float"] = ms_to_pace_float(d["avg_speed_ms"])
        result.append(d)
    return result


@app.get("/api/weekly")
def get_weekly(weeks: int = Query(26, le=104)):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT start_time, distance_m, duration_s, avg_speed_ms
        FROM activities
        WHERE distance_m IS NOT NULL AND distance_m > 0
        ORDER BY start_time ASC
        """
    ).fetchall()
    conn.close()

    # Bucket by ISO week
    buckets: dict[str, dict] = defaultdict(lambda: {
        "distance_km": 0, "runs": 0, "duration_s": 0
    })

    for r in rows:
        try:
            dt = datetime.fromisoformat(r["start_time"])
        except (ValueError, TypeError):
            continue
        week_key = dt.strftime("%Y-W%W")
        buckets[week_key]["distance_km"] += (r["distance_m"] or 0) / 1000
        buckets[week_key]["runs"] += 1
        buckets[week_key]["duration_s"] += r["duration_s"] or 0

    # Keep only the last N weeks and round values
    all_weeks = sorted(buckets.keys())[-weeks:]
    result = []
    for w in all_weeks:
        b = buckets[w]
        result.append({
            "week": w,
            "distance_km": round(b["distance_km"], 2),
            "runs": b["runs"],
            "duration_s": round(b["duration_s"]),
        })
    return result


@app.get("/api/pace-trend")
def get_pace_trend(limit: int = Query(100, le=500)):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT start_time, distance_m, avg_speed_ms, avg_hr
        FROM activities
        WHERE distance_m > 1000 AND avg_speed_ms IS NOT NULL
        ORDER BY start_time ASC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()

    return [
        {
            "date": r["start_time"][:10],
            "pace_float": ms_to_pace_float(r["avg_speed_ms"]),
            "pace": ms_to_pace(r["avg_speed_ms"]),
            "avg_hr": r["avg_hr"],
            "distance_km": round((r["distance_m"] or 0) / 1000, 2),
        }
        for r in rows
        if ms_to_pace_float(r["avg_speed_ms"])
    ]


@app.get("/api/hr-zones")
def get_hr_zones(days: int = Query(90)):
    conn = get_conn()
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    rows = conn.execute(
        """
        SELECT hz.zone, SUM(hz.seconds) as total_seconds
        FROM hr_zones hz
        JOIN activities a ON a.activity_id = hz.activity_id
        WHERE a.start_time >= ? AND a.distance_m > 0
        GROUP BY hz.zone
        ORDER BY hz.zone
        """,
        (cutoff,),
    ).fetchall()
    conn.close()

    zone_names = {1: "Z1 Easy", 2: "Z2 Aerobic", 3: "Z3 Tempo", 4: "Z4 Threshold", 5: "Z5 Max"}
    return [
        {
            "zone": r["zone"],
            "name": zone_names.get(r["zone"], f"Z{r['zone']}"),
            "seconds": round(r["total_seconds"]),
            "minutes": round(r["total_seconds"] / 60, 1),
        }
        for r in rows
    ]


@app.get("/api/stats")
def get_stats():
    conn = get_conn()

    totals = conn.execute(
        """
        SELECT
            COUNT(*) as total_runs,
            SUM(distance_m) / 1000.0 as total_km,
            SUM(duration_s) as total_seconds,
            AVG(avg_hr) as avg_hr,
            MAX(vo2max) as best_vo2max,
            AVG(vo2max) as avg_vo2max
        FROM activities
        WHERE distance_m > 0
        """
    ).fetchone()

    # Best pace ever (fastest avg speed over runs > 3 km)
    fastest = conn.execute(
        """
        SELECT avg_speed_ms, start_time, distance_m
        FROM activities
        WHERE distance_m >= 3000 AND avg_speed_ms IS NOT NULL
        ORDER BY avg_speed_ms DESC
        LIMIT 1
        """
    ).fetchone()

    # Longest run
    longest = conn.execute(
        """
        SELECT distance_m, start_time
        FROM activities
        WHERE distance_m IS NOT NULL
        ORDER BY distance_m DESC
        LIMIT 1
        """
    ).fetchone()

    # Current month
    now = datetime.utcnow()
    month_start = now.replace(day=1).isoformat()
    this_month = conn.execute(
        """
        SELECT COUNT(*) as runs, SUM(distance_m)/1000.0 as km
        FROM activities
        WHERE start_time >= ? AND distance_m > 0
        """,
        (month_start,),
    ).fetchone()

    conn.close()

    return {
        "total_runs": totals["total_runs"],
        "total_km": round(totals["total_km"] or 0, 1),
        "total_hours": round((totals["total_seconds"] or 0) / 3600, 1),
        "avg_hr": round(totals["avg_hr"] or 0, 1),
        "best_vo2max": totals["best_vo2max"],
        "avg_vo2max": round(totals["avg_vo2max"] or 0, 1),
        "fastest_pace": ms_to_pace(fastest["avg_speed_ms"]) if fastest else None,
        "longest_km": round((longest["distance_m"] or 0) / 1000, 2) if longest else None,
        "this_month_runs": this_month["runs"],
        "this_month_km": round(this_month["km"] or 0, 1),
    }
