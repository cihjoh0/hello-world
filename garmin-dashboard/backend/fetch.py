"""
Fetch running activities from Garmin Connect via garth and store them in SQLite.

Usage:
    # First-time auth (saves session token to ~/.garth):
    python fetch.py --auth

    # Incremental sync (only new activities):
    python fetch.py

    # Full re-sync of last N activities:
    python fetch.py --limit 200
"""
import argparse
import getpass
import json
import sys
from datetime import datetime, timezone

import garth

from db import get_conn, init_db


GARTH_HOME = "~/.garth"
ACTIVITY_TYPE = "running"


def authenticate():
    email = input("Garmin email: ")
    password = getpass.getpass("Garmin password: ")
    garth.login(email, password)
    garth.save(GARTH_HOME)
    print("Session saved to ~/.garth — re-run without --auth to sync data.")


def load_session():
    try:
        garth.resume(GARTH_HOME)
    except Exception:
        print("No saved session found. Run with --auth first.", file=sys.stderr)
        sys.exit(1)


def fetch_activities(limit=100, start=0):
    params = {
        "activityType": ACTIVITY_TYPE,
        "limit": limit,
        "start": start,
    }
    resp = garth.connectapi("/activitylist-service/activities/search/activities", params=params)
    return resp if isinstance(resp, list) else []


def fetch_hr_zones(activity_id):
    try:
        data = garth.connectapi(f"/activity-service/activity/{activity_id}/hrTimeInZones")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def get_existing_ids(conn):
    rows = conn.execute("SELECT activity_id FROM activities").fetchall()
    return {r["activity_id"] for r in rows}


def parse_activity(a):
    def safe(key, default=None):
        return a.get(key, default)

    activity_id = str(safe("activityId", ""))
    start_raw = safe("startTimeLocal") or safe("startTimeGMT") or ""
    distance_m = safe("distance")
    duration_s = safe("duration")
    moving_time_s = safe("movingDuration") or duration_s
    avg_hr = safe("averageHR")
    max_hr = safe("maxHR")
    avg_cadence = safe("averageRunningCadenceInStepsPerMinute") or safe("averageBikingCadenceInRevPerMinute")
    elevation_gain = safe("elevationGain")
    avg_speed_ms = safe("averageSpeed")
    calories = safe("calories")
    aerobic_te = safe("aerobicTrainingEffect")
    vo2max = safe("vO2MaxValue")

    return {
        "activity_id": activity_id,
        "name": safe("activityName", ""),
        "start_time": start_raw,
        "distance_m": distance_m,
        "duration_s": duration_s,
        "moving_time_s": moving_time_s,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "avg_cadence": avg_cadence,
        "elevation_gain": elevation_gain,
        "avg_speed_ms": avg_speed_ms,
        "calories": calories,
        "aerobic_te": aerobic_te,
        "vo2max": vo2max,
    }


def upsert_activity(conn, row):
    conn.execute("""
        INSERT INTO activities
            (activity_id, name, start_time, distance_m, duration_s, moving_time_s,
             avg_hr, max_hr, avg_cadence, elevation_gain, avg_speed_ms,
             calories, aerobic_te, vo2max)
        VALUES
            (:activity_id, :name, :start_time, :distance_m, :duration_s, :moving_time_s,
             :avg_hr, :max_hr, :avg_cadence, :elevation_gain, :avg_speed_ms,
             :calories, :aerobic_te, :vo2max)
        ON CONFLICT(activity_id) DO UPDATE SET
            name            = excluded.name,
            distance_m      = excluded.distance_m,
            duration_s      = excluded.duration_s,
            moving_time_s   = excluded.moving_time_s,
            avg_hr          = excluded.avg_hr,
            max_hr          = excluded.max_hr,
            avg_cadence     = excluded.avg_cadence,
            elevation_gain  = excluded.elevation_gain,
            avg_speed_ms    = excluded.avg_speed_ms,
            calories        = excluded.calories,
            aerobic_te      = excluded.aerobic_te,
            vo2max          = excluded.vo2max
    """, row)


def upsert_hr_zones(conn, activity_id, zones):
    conn.execute("DELETE FROM hr_zones WHERE activity_id = ?", (activity_id,))
    for z in zones:
        zone_num = z.get("zoneNumber") or z.get("zone")
        seconds = z.get("secsInZone") or z.get("seconds") or 0
        if zone_num is not None:
            conn.execute(
                "INSERT INTO hr_zones (activity_id, zone, seconds) VALUES (?, ?, ?)",
                (activity_id, zone_num, seconds),
            )


def sync(limit, incremental):
    init_db()
    conn = get_conn()
    existing = get_existing_ids(conn) if incremental else set()

    new_count = 0
    page_size = 100
    offset = 0

    while True:
        batch = fetch_activities(limit=min(page_size, limit - offset), start=offset)
        if not batch:
            break

        for a in batch:
            row = parse_activity(a)
            aid = row["activity_id"]
            if not aid:
                continue
            if incremental and aid in existing:
                continue
            upsert_activity(conn, row)
            zones = fetch_hr_zones(aid)
            upsert_hr_zones(conn, aid, zones)
            new_count += 1
            print(f"  Saved: {row['name']} ({row['start_time']}, {(row['distance_m'] or 0)/1000:.2f} km)")

        offset += len(batch)
        if offset >= limit or len(batch) < page_size:
            break

    conn.commit()
    conn.close()
    print(f"\nDone. {new_count} activities synced.")


def main():
    parser = argparse.ArgumentParser(description="Sync Garmin running data")
    parser.add_argument("--auth", action="store_true", help="Authenticate and save session")
    parser.add_argument("--limit", type=int, default=500, help="Max activities to fetch")
    parser.add_argument("--full", action="store_true", help="Re-sync all (ignore existing)")
    args = parser.parse_args()

    if args.auth:
        authenticate()
        return

    load_session()
    sync(limit=args.limit, incremental=not args.full)


if __name__ == "__main__":
    main()
