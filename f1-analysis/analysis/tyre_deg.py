"""
Tyre degradation model.

Fits a linear model to each driver's stint lap times:
    lap_time = base_pace + deg_rate × lap_in_stint

deg_rate > 0 means the driver is getting slower (degrading tyres).
The model intentionally stays linear — quadratic fits overfit on short stints.
"""

import numpy as np
import pandas as pd
from .models import DriverDeg, StintDeg


def _r_squared(y: np.ndarray, y_hat: np.ndarray) -> float:
    ss_res = np.sum((y - y_hat) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    return float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0


def _fit_stint(stint_laps: pd.DataFrame) -> StintDeg | None:
    times = stint_laps["LapTime"].dt.total_seconds().dropna().values
    if len(times) < 2:
        return None

    x = np.arange(len(times), dtype=float)
    coeffs = np.polyfit(x, times, 1)
    deg_rate, base_pace = float(coeffs[0]), float(coeffs[1])

    predicted = (base_pace + deg_rate * x).tolist()
    r2 = _r_squared(times, np.array(predicted))

    compound = str(stint_laps["Compound"].iloc[0]) if "Compound" in stint_laps.columns else "UNKNOWN"
    lap_start = int(stint_laps["LapNumber"].iloc[0])
    lap_end   = int(stint_laps["LapNumber"].iloc[-1])

    return StintDeg(
        stint=int(stint_laps["Stint"].iloc[0]),
        compound=compound,
        lap_start=lap_start,
        lap_end=lap_end,
        laps_run=len(times),
        base_pace_s=round(base_pace, 3),
        deg_rate_s_per_lap=round(deg_rate, 4),
        r_squared=round(r2, 3),
        actual_s=[round(float(t), 3) for t in times],
        predicted_s=[round(p, 3) for p in predicted],
    )


def analyse_degradation(session, driver_filter: list[str] | None = None) -> list[DriverDeg]:
    # pick_quicklaps removes laps behind SC, VSC, in-laps, out-laps
    laps = session.laps.pick_quicklaps()

    driver_results: list[DriverDeg] = []

    for driver_abbr, driver_laps in laps.groupby("Driver"):
        if driver_filter and driver_abbr not in driver_filter:
            continue

        driver_info = session.get_driver(driver_abbr)
        team = str(driver_info.get("TeamName", "")) if driver_info is not None else None

        stints: list[StintDeg] = []
        for _, stint_laps in driver_laps.groupby("Stint"):
            result = _fit_stint(stint_laps.sort_values("LapNumber"))
            if result:
                stints.append(result)

        if stints:
            driver_results.append(DriverDeg(driver=driver_abbr, team=team, stints=stints))

    return sorted(driver_results, key=lambda d: d.driver)
