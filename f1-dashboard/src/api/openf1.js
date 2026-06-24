import axios from 'axios';

const BASE_URL = 'https://api.openf1.org/v1';

const client = axios.create({ baseURL: BASE_URL });

// In-memory cache: cacheKey → Promise<data>
// Sharing the same Promise means concurrent callers with the same key
// await a single in-flight request rather than each firing their own.
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(path, params) {
  return path + '?' + new URLSearchParams(params).toString();
}

async function fetchWithRetry(path, params, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await client.get(path, { params });
      return Array.isArray(data) ? data : [];
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) return [];
      if (status === 429 && attempt < retries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
}

function listGet(path, params = {}) {
  const key = cacheKey(path, params);
  if (cache.has(key)) return cache.get(key);

  const promise = fetchWithRetry(path, params).finally(() => {
    setTimeout(() => cache.delete(key), CACHE_TTL_MS);
  });
  cache.set(key, promise);
  return promise;
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
