"""
Export SQLite data to static JSON files for the frontend.

Usage:
    python export.py                     # writes to ../frontend/public/data/
    python export.py --out /custom/dir
"""
import argparse
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

from db import get_conn, init_db


DEFAULT_OUT = Path(__file__).parent.parent / "frontend" / "public" / "data"


def ms_to_pace(avg_speed_ms):
    if not avg_speed_ms or avg_speed_ms <= 0:
        return None
    secs_per_km = 1000 / avg_speed_ms
    mins = int(secs_per_km // 60)
    secs = int(secs_per_km % 60)
    return f"{mins}:{secs:02d}"


def ms_to_pace_float(avg_speed_ms):
    if not avg_speed_ms or avg_speed_ms <= 0:
        return None
    return round(1000 / avg_speed_ms / 60, 4)


def export_stats(conn):
    totals = conn.execute("""
        SELECT COUNT(*) as total_runs,
               SUM(distance_m)/1000.0 as total_km,
               SUM(duration_s) as total_seconds,
               AVG(avg_hr) as avg_hr,
               MAX(vo2max) as best_vo2max,
               AVG(vo2max) as avg_vo2max
        FROM activities WHERE distance_m > 0
    """).fetchone()

    fastest = conn.execute("""
        SELECT avg_speed_ms FROM activities
        WHERE distance_m >= 3000 AND avg_speed_ms IS NOT NULL
        ORDER BY avg_speed_ms DESC LIMIT 1
    """).fetchone()

    longest = conn.execute("""
        SELECT distance_m FROM activities
        WHERE distance_m IS NOT NULL
        ORDER BY distance_m DESC LIMIT 1
    """).fetchone()

    month_start = datetime.utcnow().replace(day=1).isoformat()
    this_month = conn.execute("""
        SELECT COUNT(*) as runs, SUM(distance_m)/1000.0 as km
        FROM activities WHERE start_time >= ? AND distance_m > 0
    """, (month_start,)).fetchone()

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


def export_weekly(conn, weeks=104):
    rows = conn.execute("""
        SELECT start_time, distance_m, duration_s
        FROM activities WHERE distance_m > 0
        ORDER BY start_time ASC
    """).fetchall()

    buckets = defaultdict(lambda: {"distance_km": 0, "runs": 0, "duration_s": 0})
    for r in rows:
        try:
            dt = datetime.fromisoformat(r["start_time"])
        except (ValueError, TypeError):
            continue
        week_key = dt.strftime("%Y-W%W")
        buckets[week_key]["distance_km"] += (r["distance_m"] or 0) / 1000
        buckets[week_key]["runs"] += 1
        buckets[week_key]["duration_s"] += r["duration_s"] or 0

    return [
        {
            "week": w,
            "distance_km": round(buckets[w]["distance_km"], 2),
            "runs": buckets[w]["runs"],
            "duration_s": round(buckets[w]["duration_s"]),
        }
        for w in sorted(buckets.keys())[-weeks:]
    ]


def export_pace_trend(conn, limit=200):
    rows = conn.execute("""
        SELECT start_time, distance_m, avg_speed_ms, avg_hr
        FROM activities
        WHERE distance_m > 1000 AND avg_speed_ms IS NOT NULL
        ORDER BY start_time ASC LIMIT ?
    """, (limit,)).fetchall()

    return [
        {
            "date": r["start_time"][:10],
            "pace_float": ms_to_pace_float(r["avg_speed_ms"]),
            "pace": ms_to_pace(r["avg_speed_ms"]),
            "avg_hr": r["avg_hr"],
            "distance_km": round((r["distance_m"] or 0) / 1000, 2),
        }
        for r in rows if ms_to_pace_float(r["avg_speed_ms"])
    ]


def export_hr_zones(conn, days):
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    rows = conn.execute("""
        SELECT hz.zone, SUM(hz.seconds) as total_seconds
        FROM hr_zones hz
        JOIN activities a ON a.activity_id = hz.activity_id
        WHERE a.start_time >= ? AND a.distance_m > 0
        GROUP BY hz.zone ORDER BY hz.zone
    """, (cutoff,)).fetchall()

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


def export_activities(conn, limit=200):
    rows = conn.execute("""
        SELECT * FROM activities WHERE distance_m > 0
        ORDER BY start_time DESC LIMIT ?
    """, (limit,)).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["distance_km"] = round(d["distance_m"] / 1000, 2) if d["distance_m"] else None
        d["pace"] = ms_to_pace(d["avg_speed_ms"])
        d["pace_float"] = ms_to_pace_float(d["avg_speed_ms"])
        result.append(d)
    return result


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    size = "1 object" if isinstance(data, dict) else f"{len(data)} rows"
    print(f"  {path.name} ({size})")


def main():
    parser = argparse.ArgumentParser(description="Export Garmin data to JSON")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    init_db()
    conn = get_conn()

    print(f"Exporting to {args.out}/")
    write_json(args.out / "stats.json",          export_stats(conn))
    write_json(args.out / "weekly.json",          export_weekly(conn))
    write_json(args.out / "pace-trend.json",      export_pace_trend(conn))
    write_json(args.out / "activities.json",      export_activities(conn))
    write_json(args.out / "hr-zones-30d.json",    export_hr_zones(conn, 30))
    write_json(args.out / "hr-zones-90d.json",    export_hr_zones(conn, 90))
    write_json(args.out / "hr-zones-180d.json",   export_hr_zones(conn, 180))

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
