import axios from 'axios';

const BASE_URL = 'https://api.openf1.org/v1';

const client = axios.create({ baseURL: BASE_URL });

async function listGet(path, params = {}) {
  try {
    const { data } = await client.get(path, { params });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.response?.status === 404) return [];
    throw err;
  }
}

export async function getLatestSession(sessionType = 'Race') {
  const data = await listGet('/sessions', { session_type: sessionType });
  return data[data.length - 1] ?? null;
}

export async function getDrivers(sessionKey) {
  return listGet('/drivers', { session_key: sessionKey });
}

export async function getLaps(sessionKey) {
  return listGet('/laps', { session_key: sessionKey });
}

export async function getStints(sessionKey) {
  return listGet('/stints', { session_key: sessionKey });
}

export async function getPitStops(sessionKey) {
  return listGet('/pit', { session_key: sessionKey });
}

export async function getPositions(sessionKey) {
  return listGet('/position', { session_key: sessionKey });
}
