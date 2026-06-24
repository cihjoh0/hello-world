/**
 * Client for the FastF1 Python analysis server.
 *
 * In dev: requests go to /api/* and are proxied by Vite to http://localhost:8000.
 * In production: set VITE_ANALYSIS_URL to the deployed server base URL.
 *
 * All functions return null (not throw) when the server is unavailable so
 * dashboard panels can gracefully fall back to OpenF1-only data.
 */

const BASE = import.meta.env.VITE_ANALYSIS_URL ?? '/api';

async function get(path, params = {}) {
  const url = new URL(BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Analysis API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Returns { year, round } for the most recent completed race. */
export async function getLatestRaceCoords() {
  return get('/session/latest');
}

/** Event metadata: drivers list, total_laps, location, etc. */
export async function getSessionInfo(year, round, sessionType = 'R') {
  return get(`/session/${year}/${round}`, { session_type: sessionType });
}

/**
 * Tyre degradation model.
 * Returns per-driver, per-stint linear deg fit.
 * @param {string|null} driver - 3-letter code to filter, or null for all
 */
export async function getDegradation(year, round, driver = null, sessionType = 'R') {
  return get(`/analysis/${year}/${round}/degradation`, { session_type: sessionType, driver });
}

/**
 * Undercut simulation.
 * @param {string} driverA - pitting driver
 * @param {string} driverB - driver staying out
 * @param {number} pitLap  - lap on which driverA pits
 * @param {number} pitDuration - seconds (default 23)
 */
export async function getUndercut(year, round, driverA, driverB, pitLap, pitDuration = 23, sessionType = 'R') {
  return get(`/analysis/${year}/${round}/undercut`, {
    driver_a: driverA,
    driver_b: driverB,
    pit_lap: pitLap,
    pit_duration: pitDuration,
    session_type: sessionType,
  });
}

/**
 * Optimal pit window for a driver.
 * Returns per-lap net_benefit_s plus window_opens / window_closes / optimal_lap.
 */
export async function getPitWindow(year, round, driver, pitDuration = 23, sessionType = 'R') {
  return get(`/analysis/${year}/${round}/window`, {
    driver,
    pit_duration: pitDuration,
    session_type: sessionType,
  });
}
