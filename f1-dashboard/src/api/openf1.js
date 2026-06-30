import axios from 'axios';

const BASE_URL = 'https://api.openf1.org/v1';

const client = axios.create({ baseURL: BASE_URL, timeout: 30_000 });

// In-memory cache: cacheKey → Promise<data>
// Sharing the same Promise means concurrent callers with the same key
// await a single in-flight request rather than each firing their own.
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Global concurrency limiter — cap in-flight HTTP requests to avoid 429s.
// With ~30 panels loading simultaneously on mount, uncapped requests exhaust
// the OpenF1 rate limit faster than exponential backoff can recover.
const MAX_CONCURRENT = 2;
const REQUEST_GAP_MS = 500; // stagger request starts (~2/sec max)
let _active = 0;
const _queue = [];
let _rateLimitUntil = 0; // absolute ms timestamp: pause all requests until this time
let _nextSlotTime = 0;   // next available staggered start time

function withConcurrencyLimit(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _active++;
      // Claim a time slot, staggering each request by REQUEST_GAP_MS
      const slotTime = Math.max(_nextSlotTime, Date.now());
      _nextSlotTime = slotTime + REQUEST_GAP_MS;
      const wrapped = async () => {
        // Yield to the microtask queue so any pending 429 catch block can set
        // _rateLimitUntil before we compute the pause duration below.
        await Promise.resolve();
        const pause = Math.max(slotTime, _rateLimitUntil) - Date.now();
        if (pause > 0) await new Promise(r => setTimeout(r, pause));
        return fn();
      };
      Promise.resolve()
        .then(wrapped)
        .then(
          v => { _active--; if (_queue.length) _queue.shift()(); resolve(v); },
          e => { _active--; if (_queue.length) _queue.shift()(); reject(e); }
        );
    };
    if (_active < MAX_CONCURRENT) run();
    else _queue.push(run);
  });
}

function cacheKey(path, params) {
  return path + '?' + new URLSearchParams(params).toString();
}

async function fetchWithRetry(path, params, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data } = await withConcurrencyLimit(() => client.get(path, { params }));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) return [];
      // Retry on: rate limit (429), server errors (5xx), and network-level failures
      // (no response — timeout, connection reset, proxy error). Don't retry 4xx
      // client errors other than 429 since they won't resolve on retry.
      const isTransient = status === 429 || status >= 500 || !err.response;
      if (isTransient && attempt < retries) {
        let backoff = 1000 * 2 ** attempt;
        if (status === 429) {
          // Honour Retry-After header if present, then broadcast the pause globally
          // so queued requests also wait rather than firing immediately.
          const retryAfter = err.response?.headers?.['retry-after'];
          if (retryAfter) backoff = Math.max(backoff, parseInt(retryAfter, 10) * 1000);
          _rateLimitUntil = Math.max(_rateLimitUntil, Date.now() + backoff);
        }
        // Add random jitter (0–100% of backoff) so concurrent retries re-spread
        // rather than all waking at the same instant and re-bursting together.
        const jitter = Math.random() * backoff;
        await new Promise(r => setTimeout(r, backoff + jitter));
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

// All sessions of a type for a given year, sorted ascending by date.
export async function getSessions(year, sessionType = 'Race') {
  return listGet('/sessions', { year, session_type: sessionType });
}

// Returns a specific session by key, or the latest of sessionType as fallback.
// Annotates the result with a derived round_number (position in the year's
// session list, sorted by date) since the OpenF1 API doesn't return that field.
export async function resolveSession(sessionType, sessionKey = null) {
  let session;
  if (sessionKey) {
    const data = await listGet('/sessions', { session_key: sessionKey });
    session = data[0] ?? null;
  } else {
    session = await getLatestSession(sessionType);
  }
  if (!session) return null;

  // Derive round number from the session's position within its year.
  // getSessions result is already cached by App on mount, so no extra request.
  const allSessions = await getSessions(session.year, session.session_type);
  const sorted = [...allSessions].sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  const idx = sorted.findIndex(s => s.session_key === session.session_key);
  return idx >= 0 ? { ...session, round_number: idx + 1 } : session;
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

// Qualifying session for a given meeting (same race weekend).
export async function getQualifyingSession(meetingKey) {
  const data = await listGet('/sessions', { meeting_key: meetingKey, session_type: 'Qualifying' });
  return data[0] ?? null;
}

// All sessions for a given meeting (practice, qualifying, race, sprint, etc.).
export async function getMeetingSessions(meetingKey) {
  return listGet('/sessions', { meeting_key: meetingKey });
}

export async function getWeather(sessionKey) {
  return listGet('/weather', { session_key: sessionKey });
}

export async function getRaceControl(sessionKey) {
  return listGet('/race_control', { session_key: sessionKey });
}

// Raw car telemetry for one driver in a session (~3.7 Hz: speed, throttle, brake, gear, rpm).
export async function getCarData(sessionKey, driverNumber) {
  return listGet('/car_data', { session_key: sessionKey, driver_number: driverNumber });
}

// GPS position for one driver (x/y in metres, track Cartesian coordinate system).
export async function getLocation(sessionKey, driverNumber) {
  return listGet('/location', { session_key: sessionKey, driver_number: driverNumber });
}

// Team radio recordings for a session — returns {date, driver_number, recording_url}.
export async function getTeamRadio(sessionKey) {
  return listGet('/team_radio', { session_key: sessionKey });
}
