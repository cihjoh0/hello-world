"""
F1 Analysis API — FastF1 backend for the React dashboard.

Run:  uvicorn main:app --reload --port 8000

Endpoints
─────────
GET /session/latest                          latest race coordinates
GET /session/{year}/{round}                  event metadata
GET /analysis/{year}/{round}/degradation     tyre deg model per driver/stint
GET /analysis/{year}/{round}/undercut        undercut/overcut simulation
GET /analysis/{year}/{round}/window          optimal pit window per driver

All endpoints accept an optional `session_type` query param (default "R" for Race).
Degradation and window also accept `driver` to filter to one driver.
Undercut requires `driver_a`, `driver_b`, `pit_lap`.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from analysis.session import enable_cache, load_session, latest_race_coords
from analysis.tyre_deg import analyse_degradation
from analysis.undercut import simulate_undercut, optimal_pit_window
from analysis.models import DegResponse, UndercutResponse, WindowResponse


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    enable_cache()
    yield


app = FastAPI(
    title="F1 Analysis API",
    description="FastF1-backed analysis layer for the F1 analytics dashboard",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
        "http://localhost:3000",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Session endpoints ──────────────────────────────────────────────────────────

@app.get("/session/latest")
def get_latest_session():
    """Return the year and round number of the most recent completed race."""
    year, round_ = latest_race_coords()
    return {"year": year, "round": round_}


@app.get("/session/{year}/{round_}")
def get_session_info(year: int, round_: int, session_type: str = Query("R")):
    """Return event metadata for a session."""
    try:
        session = load_session(year, round_, session_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "year": year,
        "round": round_,
        "session_type": session_type,
        "event_name": session.event.get("EventName", ""),
        "location": session.event.get("Location", ""),
        "country": session.event.get("Country", ""),
        "date": str(session.date.date()) if session.date else None,
        "total_laps": int(session.laps["LapNumber"].max()) if not session.laps.empty else None,
        "drivers": sorted(session.laps["Driver"].unique().tolist()),
    }


# ── Analysis endpoints ─────────────────────────────────────────────────────────

@app.get("/analysis/{year}/{round_}/degradation", response_model=DegResponse)
def get_degradation(
    year: int,
    round_: int,
    session_type: str = Query("R"),
    driver: str | None = Query(None, description="Filter to a single driver (3-letter code)"),
):
    """
    Tyre degradation model per driver, per stint.

    Returns a linear fit (base_pace, deg_rate) for each stint.  deg_rate > 0
    means the driver is getting slower lap-on-lap.  r_squared indicates fit quality.
    """
    try:
        session = load_session(year, round_, session_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    driver_filter = [driver.upper()] if driver else None

    try:
        drivers = analyse_degradation(session, driver_filter)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")

    return DegResponse(
        year=year,
        round=round_,
        session_type=session_type,
        event_name=session.event.get("EventName", ""),
        drivers=drivers,
    )


@app.get("/analysis/{year}/{round_}/undercut", response_model=UndercutResponse)
def get_undercut(
    year: int,
    round_: int,
    driver_a: str = Query(..., description="Pitting driver (3-letter code)"),
    driver_b: str = Query(..., description="Driver staying out (3-letter code)"),
    pit_lap: int = Query(..., description="Lap on which driver_a pits"),
    pit_duration: float = Query(23.0, description="Pit stop duration in seconds"),
    session_type: str = Query("R"),
):
    """
    Simulate an undercut: driver_a pits on pit_lap, driver_b stays out.

    Returns the lap-by-lap virtual gap between the two drivers after the stop.
    A positive gap means driver_a has emerged ahead (undercut succeeded).
    crossover_lap is the first lap where driver_a is virtually ahead.
    """
    try:
        session = load_session(year, round_, session_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        result = simulate_undercut(
            session,
            driver_a.upper(),
            driver_b.upper(),
            pit_lap,
            pit_duration,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Simulation error: {e}")

    return result


@app.get("/analysis/{year}/{round_}/window", response_model=WindowResponse)
def get_pit_window(
    year: int,
    round_: int,
    driver: str = Query(..., description="Driver to analyse (3-letter code)"),
    pit_duration: float = Query(23.0, description="Pit stop duration in seconds"),
    session_type: str = Query("R"),
):
    """
    Compute the optimal pit window for a driver.

    For each possible pit lap, calculates the net time benefit of pitting
    vs staying out for the rest of the race, using the driver's actual
    tyre degradation rate at that point in the stint.

    window_opens / window_closes bracket the laps where net_benefit_s > 0.
    optimal_lap is the lap with the highest net benefit.
    """
    try:
        session = load_session(year, round_, session_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        result = optimal_pit_window(session, driver.upper(), pit_duration)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Window error: {e}")

    return result
