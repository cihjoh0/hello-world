async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const fetchStats = () =>
  fetchJson("/data/stats.json");

export const fetchActivities = (limit = 200) =>
  fetchJson("/data/activities.json").then((d) => d.slice(0, limit));

export const fetchWeekly = (weeks = 26) =>
  fetchJson("/data/weekly.json").then((d) => d.slice(-weeks));

export const fetchPaceTrend = (limit = 150) =>
  fetchJson("/data/pace-trend.json").then((d) => d.slice(-limit));

export const fetchHrZones = (days = 90) =>
  fetchJson(`/data/hr-zones-${days}d.json`);
