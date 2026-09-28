// Pendle hosted API client plus BANDIT's band math.
// Endpoints (api-v2.pendle.finance/core/docs):
//   GET /v2/markets/all?chainId=&isActive=true&limit=100&skip=   active markets with live details (2 CU)
//   GET /v3/{chainId}/markets/{address}/historical-data           daily implied APY history (1 CU per 300 points)
// All APY values from Pendle are decimals (0.05 = 5%).

const PENDLE_API = 'https://api-v2.pendle.finance/core';

export const CHAINS = [
  { id: 1, name: 'Ethereum', short: 'ETH' },
  { id: 42161, name: 'Arbitrum', short: 'ARB' },
];

// Markets with less pool liquidity than this are left off the board.
export const MIN_LIQUIDITY_USD = 1_000_000;

const BAND_DAYS = 90;            // band window
const MIN_BAND_DAYS = 14;        // under this, the band is "forming" and gets no percentile
const MIN_HISTORY_TVL_USD = 100_000; // ignore history days when the pool was nearly empty (launch anchors)
const CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_CONCURRENCY = 8;
const DAY_MS = 86_400_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dayKey = d => new Date(d).toISOString().slice(0, 10);

async function pendle(path, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(PENDLE_API + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      if (attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
      throw new Error(`Pendle API unreachable (${e.name === 'TimeoutError' ? 'timeout' : e.message})`);
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(700 * 2 ** attempt); continue; }
    throw new Error(`Pendle API HTTP ${res.status} on ${path.split('?')[0]}`);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function activeMarkets(chainId) {
  const all = [];
  for (let skip = 0; ; skip += 100) {
    const page = await pendle(`/v2/markets/all?chainId=${chainId}&isActive=true&limit=100&skip=${skip}`);
    all.push(...(page.results || []));
    if (!page.results?.length || skip + 100 >= (page.total ?? 0)) break;
  }
  return all;
}

async function dailyHistory(chainId, address, now) {
  // Date-only bounds keep the URL stable for the day, so Pendle's edge cache can serve repeats.
  const start = dayKey(now - (BAND_DAYS + 1) * DAY_MS);
  const end = dayKey(now + DAY_MS);
  const page = await pendle(`/v3/${chainId}/markets/${address}/historical-data?time_frame=day&timestamp_start=${start}&timestamp_end=${end}&fields=timestamp,impliedApy,tvl`);
  return page.results || [];
}

// Percentile rank of today's rate among past daily closes: share of days lower, ties count half.
function percentileRank(values, x) {
  let below = 0, equal = 0;
  for (const v of values) { if (v < x) below++; else if (v === x) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}

export function computeBand(rows, current, now) {
  const today = dayKey(now);
  const cutoff = dayKey(now - BAND_DAYS * DAY_MS);
  // Day buckets hold that UTC day's close; today's bucket is still moving, so the live rate stands in for it.
  const past = rows.filter(r => {
    const d = dayKey(r.timestamp);
    return d < today && d >= cutoff && Number.isFinite(r.impliedApy) && (r.tvl ?? 0) >= MIN_HISTORY_TVL_USD;
  });
  const values = past.map(r => r.impliedApy);
  const days = values.length + 1;
  const all = [...values, current];
  const band = { status: days >= MIN_BAND_DAYS ? 'formed' : 'forming', days, min: Math.min(...all), max: Math.max(...all), percentile: null };
  if (band.status === 'formed') band.percentile = Math.round(percentileRank(values, current) * 10) / 10;
  const weekAgo = past.find(r => dayKey(r.timestamp) === dayKey(now - 7 * DAY_MS));
  return { band, change7d: weekAgo ? current - weekAgo.impliedApy : null };
}

async function buildMarkets() {
  const now = Date.now();
  const warnings = [];
  const lists = await Promise.all(CHAINS.map(async c => {
    try { return (await activeMarkets(c.id)).map(m => ({ ...m, chainId: c.id, chainName: c.name })); }
    catch (e) { warnings.push(`${c.name}: ${e.message}`); return []; }
  }));
  if (lists.every(l => !l.length) && warnings.length) throw new Error(warnings.join('; '));

  const liquid = lists.flat().filter(m => {
    const d = m.details || {};
    return Number.isFinite(d.impliedApy) && (d.liquidity ?? 0) >= MIN_LIQUIDITY_USD && new Date(m.expiry).getTime() > now;
  });

  const markets = await mapLimit(liquid, HISTORY_CONCURRENCY, async m => {
    const d = m.details;
    const out = {
      id: `${m.chainId}-${m.address}`,
      venue: 'pendle',
      chainId: m.chainId,
      chainName: m.chainName,
      address: m.address,
      name: m.name,
      protocol: m.protocol || null,
      expiry: m.expiry,
      daysToMaturity: Math.max(0, Math.ceil((new Date(m.expiry).getTime() - now) / DAY_MS)),
      impliedApy: d.impliedApy,
      underlyingApy: Number.isFinite(d.underlyingApy) ? d.underlyingApy : null,
      liquidityUsd: d.liquidity,
      totalTvlUsd: d.totalTvl ?? null,
      volume24hUsd: d.tradingVolume ?? null,
      hasPoints: Array.isArray(m.points) && m.points.length > 0,
      change7d: null,
      band: { status: 'unavailable', days: 0, min: null, max: null, percentile: null },
    };
    try {
      Object.assign(out, computeBand(await dailyHistory(m.chainId, m.address, now), d.impliedApy, now));
    } catch (e) {
      warnings.push(`${m.name} (${m.chainName}) history: ${e.message}`);
    }
    return out;
  });

  return {
    updatedAt: new Date(now).toISOString(),
    source: 'api-v2.pendle.finance',
    minLiquidityUsd: MIN_LIQUIDITY_USD,
    bandDays: BAND_DAYS,
    minBandDays: MIN_BAND_DAYS,
    chains: CHAINS,
    markets: markets.sort((a, b) => b.liquidityUsd - a.liquidityUsd),
    warnings,
  };
}

// Five-minute in-memory cache per warm instance, with concurrent callers sharing one fetch.
let cache = null;
let inflight = null;
export async function getMarkets() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (!inflight) {
    inflight = buildMarkets()
      .then(data => { cache = { at: Date.now(), data }; return data; })
      .finally(() => { inflight = null; });
  }
  try {
    return await inflight;
  } catch (e) {
    if (cache) return cache.data; // serve the last good board rather than an error
    throw e;
  }
}
