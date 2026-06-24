from pydantic import BaseModel


class StintDeg(BaseModel):
    stint: int
    compound: str
    lap_start: int
    lap_end: int
    laps_run: int
    base_pace_s: float        # predicted time at lap 0 of stint
    deg_rate_s_per_lap: float # seconds lost per lap (positive = getting slower)
    r_squared: float
    actual_s: list[float]
    predicted_s: list[float]


class DriverDeg(BaseModel):
    driver: str
    team: str | None
    stints: list[StintDeg]


class DegResponse(BaseModel):
    year: int
    round: int
    session_type: str
    event_name: str
    drivers: list[DriverDeg]


class UndercutLap(BaseModel):
    lap: int
    # cumulative gap: positive = A ahead (undercut working), negative = A behind
    virtual_gap_s: float
    a_pace_s: float
    b_pace_s: float


class UndercutResponse(BaseModel):
    driver_a: str
    driver_b: str
    pit_lap: int
    pit_duration_s: float
    # gap at moment of pit entry: positive = A ahead
    gap_at_pit_s: float
    deg_rate_a_s_per_lap: float
    deg_rate_b_s_per_lap: float
    fresh_pace_estimate_s: float
    crossover_lap: int | None        # lap when A rejoins ahead (None = undercut fails)
    undercut_works: bool
    simulation: list[UndercutLap]


class WindowLap(BaseModel):
    lap: int
    laps_remaining: int
    deg_rate_s_per_lap: float
    # net time saved vs staying out for the rest of the race
    # positive = worth pitting now, negative = too early
    net_benefit_s: float


class WindowResponse(BaseModel):
    driver: str
    pit_duration_s: float
    total_laps: int
    optimal_lap: int | None
    # window where net_benefit > 0
    window_opens: int | None
    window_closes: int | None
    per_lap: list[WindowLap]
