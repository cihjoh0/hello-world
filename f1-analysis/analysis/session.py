import fastf1
from functools import lru_cache
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "cache"


def enable_cache():
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
    """Return (year, round) for the most recent completed race."""
    schedule = fastf1.get_event_schedule(2025, include_testing=False)
    completed = schedule[schedule["EventFormat"] != "testing"]
    if completed.empty:
        return (2024, 24)
    last = completed.iloc[-1]
    return (int(last["year"]) if "year" in last else 2025, int(last["RoundNumber"]))
