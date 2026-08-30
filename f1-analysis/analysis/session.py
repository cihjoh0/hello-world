import fastf1
from datetime import datetime
from functools import lru_cache
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "cache"


def enable_cache():
    # cache/ is gitignored (correctly — it's downloaded FastF1 session data,
    # not source), so it doesn't exist on a fresh clone and FastF1 refuses
    # to enable a cache directory that isn't there yet. Create it on demand.
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))


@lru_cache(maxsize=16)
def load_session(year: int, round_: int, session_type: str = "R"):
    """Load a FastF1 session, cached in memory after first load."""
    session = fastf1.get_session(year, round_, session_type)
    session.load(telemetry=False, weather=False, messages=False)
    return session


@lru_cache(maxsize=4)
def load_session_with_telemetry(year: int, round_: int, session_type: str = "R"):
    session = fastf1.get_session(year, round_, session_type)
    session.load(telemetry=True, weather=False, messages=False)
    return session


def latest_race_coords() -> tuple[int, int]:
    """Return (year, round) for the most recent completed race.

    Searches back from the current year (rather than a hardcoded season) so
    this keeps working after a season rolls over, and filters by EventDate
    so it never returns a race that hasn't happened yet — e.g. early in a
    season, before the current year's schedule has any completed rounds.
    """
    now = datetime.now()
    for year in (now.year, now.year - 1):
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        completed = schedule[schedule["EventDate"] <= now]
        if not completed.empty:
            last = completed.iloc[-1]
            return (year, int(last["RoundNumber"]))
    return (2024, 24)  # last-resort fallback


def latest_sprint_coords() -> tuple[int, int]:
    """Return (year, round) for the most recent completed sprint race weekend."""
    now = datetime.now()
    for year in (now.year, now.year - 1):
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        sprints = schedule[
            schedule["EventFormat"].str.lower().str.contains("sprint", na=False)
            & (schedule["EventDate"] <= now)
        ]
        if not sprints.empty:
            last = sprints.iloc[-1]
            return (year, int(last["RoundNumber"]))
    return (2024, 5)  # China 2024 sprint as final fallback


def get_event_info(year: int, round_: int) -> dict:
    """Return event metadata from the schedule — no full session download needed."""
    schedule = fastf1.get_event_schedule(year, include_testing=False)
    row = schedule[schedule["RoundNumber"] == round_]
    if row.empty:
        raise ValueError(f"Round {round_} not found in {year} schedule")
    r = row.iloc[0]
    return {
        "year":       year,
        "round":      round_,
        "event_name": str(r.get("EventName", "")),
        "location":   str(r.get("Location", "")),
        "country":    str(r.get("Country", "")),
        "date":       str(r.get("EventDate", ""))[:10],
    }
