"""
Undercut / overcut simulation.

Given two drivers and a hypothetical pit lap for driver A, this module:
1. Computes the on-track gap at the moment of the stop.
2. Fits linear deg models to each driver's current stint.
3. Estimates driver A's fresh-tyre pace from their first stint on the
   same compound (or falls back to current-pace minus accumulated deg).
4. Simulates lap-by-lap virtual gaps for the next 20 laps.

Virtual gap convention:
  positive = A is ahead (undercut has worked or is working)
  negative = A is behind (undercut hasn't paid off yet)

Optimal pit window:
  For each possible pit lap L, compute the net benefit of pitting on L
  vs staying out for all remaining laps.  This identifies the window
  where the pit stop recovers its own time cost.
"""

import numpy as np
import pandas as pd
from .models import UndercutLap, UndercutResponse, WindowLap, WindowResponse

# Fraction of old-tyre deg rate assumed on fresh rubber of the same compound.
# Reality varies (0.2–0.4 is typical); 0.3 is a reasonable conservative estimate.
FRESH_DEG_FRACTION = 0.3

# Assumed pace improvement on lap 1 of a new stint vs the end of the old stint
# (captures the jump in grip before the thermal deg cycle begins).
FRESH_TYRE_BOOST_S = 0.8


def _cum_time(laps: pd.DataFrame, through_lap: int) -> float:
    return laps[laps["LapNumber"] <= through_lap]["LapTime"].dt.total_seconds().sum()


def _current_stint(laps: pd.DataFrame, at_lap: int) -> pd.DataFrame:
    stint_num = laps[laps["LapNumber"] <= at_lap]["Stint"].iloc[-1]
    return laps[(laps["Stint"] == stint_num) & (laps["LapNumber"] <= at_lap)].sort_values("LapNumber")


def _fit_deg(laps: pd.DataFrame) -> tuple[float, float]:
    """Return (deg_rate, current_pace) for laps (already filtered to one stint)."""
    times = laps["LapTime"].dt.total_seconds().dropna().values
    if len(times) < 2:
        return (0.0, float(times[-1]) if len(times) else 92.0)
    x = np.arange(len(times), dtype=float)
    coeffs = np.polyfit(x, times, 1)
    deg_rate = float(coeffs[0])
    current_pace = float(times[-1])
    return deg_rate, current_pace


def _fresh_pace_estimate(
    all_laps: pd.DataFrame,
    driver: str,
    compound: str | None,
    current_pace: float,
    deg_rate: float,
    laps_on_current: int,
) -> float:
    """
    Estimate race pace on lap 1 of a new set.

    Prefer: median of the first 3 quick laps from driver's earliest stint on
    the same compound.  Fall back to: current_pace − (deg_rate × laps_on_current)
    − FRESH_TYRE_BOOST_S.
    """
    if compound:
        prev = (
            all_laps[
                (all_laps["Driver"] == driver)
                & (all_laps["Compound"] == compound)
            ]
            .sort_values("LapNumber")
            .groupby("Stint", sort=True)
            .first()
            .reset_index()
        )
        # Use laps from stints other than the current one
        fresh_laps = all_laps[
            (all_laps["Driver"] == driver)
            & (all_laps["Compound"] == compound)
            & (all_laps["Stint"] == prev["Stint"].iloc[0])
        ].sort_values("LapNumber").head(3) if not prev.empty else pd.DataFrame()

        if not fresh_laps.empty:
            return float(fresh_laps["LapTime"].dt.total_seconds().median())

    # Fall back: unwind current deg and apply boost
    return current_pace - (deg_rate * laps_on_current) - FRESH_TYRE_BOOST_S


def simulate_undercut(
    session,
    driver_a: str,
    driver_b: str,
    pit_lap: int,
    pit_duration: float = 23.0,
    sim_laps: int = 20,
) -> UndercutResponse:
    quick = session.laps.pick_quicklaps()
    laps_a = quick[quick["Driver"] == driver_a].sort_values("LapNumber")
    laps_b = quick[quick["Driver"] == driver_b].sort_values("LapNumber")

    # ── Gap at pit entry ─────────────────────────────────────────────────────
    cum_a = _cum_time(laps_a, pit_lap)
    cum_b = _cum_time(laps_b, pit_lap)
    # Positive gap = A is ahead (A's total time is smaller)
    gap_at_pit = round(cum_b - cum_a, 3)

    # ── Deg models ───────────────────────────────────────────────────────────
    stint_a = _current_stint(laps_a, pit_lap)
    deg_rate_a, current_pace_a = _fit_deg(stint_a)
    compound_a = str(stint_a["Compound"].iloc[-1]) if "Compound" in stint_a.columns else None
    laps_on_tyres_a = len(stint_a)

    stint_b = _current_stint(laps_b, pit_lap)
    deg_rate_b, current_pace_b = _fit_deg(stint_b)

    fresh_pace = _fresh_pace_estimate(
        session.laps, driver_a, compound_a, current_pace_a, deg_rate_a, laps_on_tyres_a
    )
    fresh_deg_rate = deg_rate_a * FRESH_DEG_FRACTION

    # ── Simulation ───────────────────────────────────────────────────────────
    # A's ghost time after pit: cumulative race time + pit cost
    ghost_cum_a = cum_a + pit_duration
    cum_b_sim   = cum_b

    simulation: list[UndercutLap] = []
    for offset in range(1, sim_laps + 1):
        # A on fresh tyres — very small deg in first laps then building
        a_pace = fresh_pace + fresh_deg_rate * (offset - 1)
        ghost_cum_a += a_pace

        # B continuing on degrading tyres
        b_pace = current_pace_b + deg_rate_b * offset
        cum_b_sim += b_pace

        # Virtual gap: positive = A ahead
        virtual_gap = round(cum_b_sim - ghost_cum_a, 3)

        simulation.append(UndercutLap(
            lap=pit_lap + offset,
            virtual_gap_s=virtual_gap,
            a_pace_s=round(a_pace, 3),
            b_pace_s=round(b_pace, 3),
        ))

    crossover = next((s.lap for s in simulation if s.virtual_gap_s > 0), None)

    return UndercutResponse(
        driver_a=driver_a,
        driver_b=driver_b,
        pit_lap=pit_lap,
        pit_duration_s=pit_duration,
        gap_at_pit_s=gap_at_pit,
        deg_rate_a_s_per_lap=round(deg_rate_a, 4),
        deg_rate_b_s_per_lap=round(deg_rate_b, 4),
        fresh_pace_estimate_s=round(fresh_pace, 3),
        crossover_lap=crossover,
        undercut_works=crossover is not None,
        simulation=simulation,
    )


def optimal_pit_window(
    session,
    driver: str,
    pit_duration: float = 23.0,
    fresh_deg_fraction: float = FRESH_DEG_FRACTION,
    fresh_boost: float = FRESH_TYRE_BOOST_S,
) -> WindowResponse:
    """
    For each possible pit lap, compute net_benefit_s:
        = Σ_remaining [old_pace(i) - new_pace(i)] - pit_duration

    old_pace(i)  = current_pace + deg_rate × i          (staying out)
    new_pace(i)  = fresh_base + fresh_deg × i            (pitting now)
    fresh_base   = current_pace - deg_rate × laps_on_set - fresh_boost

    net_benefit > 0  → pitting this lap recovers the pit-time cost
    """
    quick = session.laps.pick_quicklaps()
    driver_laps = quick[quick["Driver"] == driver].sort_values("LapNumber")

    # Use the stint data to determine total race laps
    total_laps = int(session.laps["LapNumber"].max())

    per_lap: list[WindowLap] = []

    for pivot_lap in range(
        int(driver_laps["LapNumber"].min()) + 2,
        int(driver_laps["LapNumber"].max()) - 2,
    ):
        stint = _current_stint(driver_laps, pivot_lap)
        if len(stint) < 2:
            continue

        deg_rate, current_pace = _fit_deg(stint)
        laps_on_tyres = len(stint)
        laps_remaining = total_laps - pivot_lap
        if laps_remaining <= 0:
            continue

        fresh_base = current_pace - deg_rate * laps_on_tyres - fresh_boost
        fresh_deg  = deg_rate * fresh_deg_fraction

        # Accumulate benefit lap by lap
        net_benefit = -pit_duration
        for i in range(1, laps_remaining + 1):
            old_t   = current_pace + deg_rate * i
            new_t   = fresh_base + fresh_deg * (i - 1)
            net_benefit += old_t - new_t

        per_lap.append(WindowLap(
            lap=pivot_lap,
            laps_remaining=laps_remaining,
            deg_rate_s_per_lap=round(deg_rate, 4),
            net_benefit_s=round(net_benefit, 2),
        ))

    # Find optimal lap (max benefit) and window boundaries
    optimal_lap   = max(per_lap, key=lambda r: r.net_benefit_s, default=None)
    window_opens  = next((r.lap for r in per_lap if r.net_benefit_s > 0), None)
    window_closes = next((r.lap for r in reversed(per_lap) if r.net_benefit_s > 0), None)

    return WindowResponse(
        driver=driver,
        pit_duration_s=pit_duration,
        total_laps=total_laps,
        optimal_lap=optimal_lap.lap if optimal_lap else None,
        window_opens=window_opens,
        window_closes=window_closes,
        per_lap=per_lap,
    )
