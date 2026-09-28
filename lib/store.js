// Minimal Upstash Redis REST client. Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN;
// Upstash's own integration sets UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Either works.
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeReady = () => Boolean(REST_URL && REST_TOKEN);

export async function redis(...command) {
  if (!storeReady()) throw new Error('Agent storage is not connected yet. Add Upstash Redis to the Vercel project.');
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command.map(String)),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Storage error: ${body.error || `HTTP ${res.status}`}`);
  return body.result;
}

export async function getJSON(key, fallback) {
  const raw = await redis('GET', key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export const setJSON = (key, value) => redis('SET', key, JSON.stringify(value));

export const KEYS = {
  rules: 'bandit:rules',
  events: 'bandit:events',
  positions: 'bandit:positions',
  spent: day => `bandit:spent:${day}`,
  followers: 'bandit:tg:followers',
  telegram: 'bandit:tg:meta',
  lastRun: 'bandit:watch:last',
  lock: 'bandit:watch:lock',
  hits: (bucket, id) => `bandit:hits:${bucket}:${id}`,
};

// Append an event to the public activity log (newest first, capped).
export async function logEvent(event) {
  const e = { id: `e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), ...event };
  await redis('LPUSH', KEYS.events, JSON.stringify(e));
  await redis('LTRIM', KEYS.events, 0, 299);
  return e;
}

export async function recentEvents(n = 60) {
  const rows = await redis('LRANGE', KEYS.events, 0, n - 1);
  return (rows || []).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

// Fixed-window rate limit backed by Redis, so it holds across serverless instances.
export async function rateLimited(bucket, id, max, windowSec) {
  if (!storeReady()) return false;
  const key = KEYS.hits(bucket, id);
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, windowSec);
  return n > max;
}
