import axios from 'axios';

const BASE_URL = 'https://api.openf1.org/v1';

const client = axios.create({ baseURL: BASE_URL });

export async function getLatestSession(sessionType = 'Race') {
  const { data } = await client.get('/sessions', {
    params: { session_type: sessionType },
  });
  // API returns sessions sorted ascending; take the last one
  return data[data.length - 1] ?? null;
}

export async function getDrivers(sessionKey) {
  const { data } = await client.get('/drivers', {
    params: { session_key: sessionKey },
  });
  return data;
}

export async function getLaps(sessionKey) {
  const { data } = await client.get('/laps', {
    params: { session_key: sessionKey },
  });
  return data;
}
