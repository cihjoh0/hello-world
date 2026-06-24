const BASE = "/api";

async function get(path, params = {}) {
  const url = new URL(BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const fetchStats = () => get("/stats");
export const fetchActivities = (limit = 200) => get("/activities", { limit });
export const fetchWeekly = (weeks = 26) => get("/weekly", { weeks });
export const fetchPaceTrend = (limit = 100) => get("/pace-trend", { limit });
export const fetchHrZones = (days = 90) => get("/hr-zones", { days });
