import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "garmin.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS activities (
            id              INTEGER PRIMARY KEY,
            activity_id     TEXT UNIQUE NOT NULL,
            name            TEXT,
            start_time      TEXT NOT NULL,
            distance_m      REAL,
            duration_s      REAL,
            moving_time_s   REAL,
            avg_hr          REAL,
            max_hr          REAL,
            avg_cadence     REAL,
            elevation_gain  REAL,
            avg_speed_ms    REAL,
            calories        REAL,
            training_effect REAL,
            aerobic_te      REAL,
            vo2max          REAL
        );

        CREATE TABLE IF NOT EXISTS hr_zones (
            id          INTEGER PRIMARY KEY,
            activity_id TEXT NOT NULL REFERENCES activities(activity_id),
            zone        INTEGER NOT NULL,
            seconds     REAL NOT NULL
        );
    """)
    conn.commit()
    conn.close()
