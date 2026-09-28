// Minimal Upstash Redis REST client. Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN;
// Upstash's own integration sets UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Either works.
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Local development only: dev-server.mjs sets BANDIT_DEV_MEMORY_STORE=1 when no Redis is configured,
// so the whole agent can be exercised on localhost without production credentials.
const MEMORY = process.env.BANDIT_DEV_MEMORY_STORE === '1' && !(REST_URL && REST_TOKEN);
const mem = new Map();
function memGet(k) { const e = mem.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; } return e.v; }
function memCmd(cmd, k, ...a) {
  const set = (v, exp) => mem.set(k, { v, exp });
  switch (cmd.toUpperCase()) {
    case 'GET': return memGet(k);
    case 'SET': {
      const nx = a.includes('NX'); const ex = a.indexOf('EX');
      if (nx && memGet(k) != null) return null;
      set(a[0], ex >= 0 ? Date.now() + Number(a[ex + 1]) * 1000 : undefined); return 'OK';
    }
    case 'DEL': return mem.delete(k) ? 1 : 0;
    case 'INCR': { const n = Number(memGet(k) || 0) + 1; set(String(n), mem.get(k)?.exp); return n; }
    case 'INCRBYFLOAT': { const n = Number(memGet(k) || 0) + Number(a[0]); set(String(n), mem.get(k)?.exp); return String(n); }
    case 'EXPIRE': { const e = mem.get(k); if (e) e.exp = Date.now() + Number(a[0]) * 1000; return e ? 1 : 0; }
    case 'LPUSH': { const l = memGet(k) || []; l.unshift(...a); set(l); return l.length; }
    case 'LTRIM': { const l = memGet(k) || []; set(l.slice(Number(a[0]), Number(a[1]) + 1)); return 'OK'; }
    case 'LRANGE': { const l = memGet(k) || []; return l.slice(Number(a[0]), Number(a[1]) === -1 ? undefined : Number(a[1]) + 1); }
    case 'SADD': { const st = new Set(memGet(k) || []); const had = st.has(a[0]); st.add(a[0]); set([...st]); return had ? 0 : 1; }
    case 'SREM': { const st = new Set(memGet(k) || []); const had = st.delete(a[0]); set([...st]); return had ? 1 : 0; }
    case 'SMEMBERS': return memGet(k) || [];
    default: throw new Error(`memory store: unsupported ${cmd}`);
  }
}

export const storeReady = () => Boolean(REST_URL && REST_TOKEN) || MEMORY;

export async function redis(...command) {
  if (!storeReady()) throw new Error('Agent storage is not connected yet. Add Upstash Redis to the Vercel project.');
  if (MEMORY) return memCmd(...command.map(String));
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

// One shared daily budget for SERV calls anyone can trigger (Ask BANDIT, trade reviews, personal agents),
// so public traffic can never drain the SERV credits. The owner's house agent is not counted.
export const PUBLIC_SERV_DAILY_CAP = Number(process.env.PUBLIC_SERV_DAILY_CAP || 150);
export async function takePublicServBudget() {
  if (!storeReady()) return true;
  const key = `bandit:serv:public:${new Date().toISOString().slice(0, 10)}`;
  const n = Number(await redis('INCR', key));
  if (n === 1) await redis('EXPIRE', key, 2 * 86400);
  return n <= PUBLIC_SERV_DAILY_CAP;
}

